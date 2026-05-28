package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	nodeports "github.com/kleffio/platform/internal/core/nodes/ports"
	orgports "github.com/kleffio/platform/internal/core/organizations/ports"
	projectdomain "github.com/kleffio/platform/internal/core/projects/domain"
	projectports "github.com/kleffio/platform/internal/core/projects/ports"
	envdomain "github.com/kleffio/platform/internal/core/environments/domain"
	envports "github.com/kleffio/platform/internal/core/environments/ports"
	nsdomain "github.com/kleffio/platform/internal/core/namespaces/domain"
	nsports "github.com/kleffio/platform/internal/core/namespaces/ports"
	usagedomain "github.com/kleffio/platform/internal/core/usage/domain"
	usageports "github.com/kleffio/platform/internal/core/usage/ports"
	"github.com/kleffio/platform/internal/core/workloads/application/commands"
	"github.com/kleffio/platform/internal/core/workloads/domain"
	"github.com/kleffio/platform/internal/core/workloads/ports"
	"github.com/kleffio/platform/internal/shared/events"
	"github.com/kleffio/platform/internal/shared/ids"
	"github.com/kleffio/platform/internal/shared/middleware"
	"github.com/kleffio/platform/internal/shared/queue"
)

const (
	nsWorkloadBasePath    = "/api/v1/namespaces/{slug}/workloads"
	projectBasePath       = "/api/v1/namespaces/{slug}/environments/{env}/workloads"
	legacyProjectBasePath = "/api/v1/projects/{projectID}/workloads"
	workloadBasePath      = "/api/v1/workloads"
	internalBasePath      = "/api/v1/internal/workloads"
)

type Handler struct {
	projects     projectports.ProjectRepository
	envs         envports.EnvironmentRepository
	nsRepo       nsports.NamespaceRepository
	orgs         orgports.OrganizationRepository
	repo         ports.Repository
	usageRepo    usageports.UsageRepository
	metricsSink  ports.MetricsSink
	provision    *commands.ProvisionWorkloadHandler
	action       *commands.WorkloadActionHandler
	publisher    queue.Publisher
	bus          *events.Bus
	nodes        nodeports.NodeRepository
	sharedSecret string
	fileClient   *http.Client
	logger       *slog.Logger
}

var orgSlugCleaner = regexp.MustCompile(`[^a-z0-9-]+`)

func NewHandler(projects projectports.ProjectRepository, envs envports.EnvironmentRepository, nsRepo nsports.NamespaceRepository, orgs orgports.OrganizationRepository, repo ports.Repository, usageRepo usageports.UsageRepository, metricsSink ports.MetricsSink, provision *commands.ProvisionWorkloadHandler, action *commands.WorkloadActionHandler, publisher queue.Publisher, bus *events.Bus, nodes nodeports.NodeRepository, sharedSecret string, logger *slog.Logger) *Handler {
	return &Handler{
		projects:     projects,
		envs:         envs,
		nsRepo:       nsRepo,
		orgs:         orgs,
		repo:         repo,
		usageRepo:    usageRepo,
		metricsSink:  metricsSink,
		provision:    provision,
		action:       action,
		publisher:    publisher,
		bus:          bus,
		nodes:        nodes,
		sharedSecret: sharedSecret,
		fileClient:   &http.Client{Timeout: 60 * time.Second},
		logger:       logger,
	}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	// Phase 1: Namespace-scoped flat workload routes (no environment required).
	r.Get(nsWorkloadBasePath, h.listByNamespace)
	r.Post(nsWorkloadBasePath, h.provisionForNamespace)
	r.Get(nsWorkloadBasePath+"/{id}", h.getForNamespace)
	r.Post(nsWorkloadBasePath+"/{id}/start", h.startForNamespace)
	r.Post(nsWorkloadBasePath+"/{id}/stop", h.stopForNamespace)
	r.Post(nsWorkloadBasePath+"/{id}/restart", h.restartForNamespace)
	r.Delete(nsWorkloadBasePath+"/{id}", h.deleteForNamespace)

	// Environment-scoped routes (legacy — kept for backward compat).
	r.Get(projectBasePath, h.list)
	r.Post(projectBasePath, h.provisionWorkload)
	r.Get(projectBasePath+"/{id}", h.getForProject)
	r.Post(projectBasePath+"/{id}/start", h.start)
	r.Post(projectBasePath+"/{id}/stop", h.stop)
	r.Post(projectBasePath+"/{id}/restart", h.restart)
	r.Delete(projectBasePath+"/{id}", h.delete)

	// Legacy project-scoped routes retained during environment migration.
	r.Get(legacyProjectBasePath, h.listLegacy)
	r.Post(legacyProjectBasePath, h.provisionWorkloadLegacy)
	r.Post(legacyProjectBasePath+"/{id}/start", h.startLegacy)
	r.Post(legacyProjectBasePath+"/{id}/stop", h.stopLegacy)
	r.Post(legacyProjectBasePath+"/{id}/restart", h.restartLegacy)
	r.Delete(legacyProjectBasePath+"/{id}", h.deleteLegacy)
	r.Post(projectBasePath+"/{id}/mods/install", h.installMod)
	r.Post(projectBasePath+"/{id}/mods/uninstall", h.uninstallMod)
	r.Get(workloadBasePath+"/{id}", h.get)

	// File manager — proxy to daemon file API
	r.Get(projectBasePath+"/{id}/files", h.proxyFiles)
	r.Get(projectBasePath+"/{id}/files/download", h.proxyFiles)
	r.Get(projectBasePath+"/{id}/files/export", h.proxyFiles)
	r.Post(projectBasePath+"/{id}/files/upload", h.proxyFiles)
	r.Post(projectBasePath+"/{id}/files/rename", h.proxyFiles)
	r.Post(projectBasePath+"/{id}/files/mkdir", h.proxyFiles)
	r.Post(projectBasePath+"/{id}/files/import", h.proxyFiles)
	r.Delete(projectBasePath+"/{id}/files", h.proxyFiles)
}

func (h *Handler) RegisterInternalRoutes(r chi.Router) {
	r.Post(internalBasePath+"/{id}/status", h.updateStatus)
}

func (h *Handler) provisionWorkload(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "env")
	orgID := h.callerOrganizationID(r)
	envObj, effectiveOrgID, err := h.ensureEnvironmentAccess(r, slug, envSlug, orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	// Viewers may not create workloads — requires developer or above.
	if h.projects != nil {
		if claims, ok := middleware.ClaimsFromContext(r.Context()); ok && claims.PlatformUserID != "" {
			member, memberErr := h.projects.GetMember(r.Context(), envObj.ID, claims.PlatformUserID)
			if memberErr == nil && projectdomain.RoleRank(member.Role) < projectdomain.RoleRank(projectdomain.RoleDeveloper) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: requires developer role or higher"})
				return
			}
		}
	}
	var req struct {
		OrganizationID string            `json:"organization_id"`
		OwnerID        string            `json:"owner_id"`
		ServerName     string            `json:"server_name"`
		BlueprintID    string            `json:"blueprint_id"`
		Image          string            `json:"image"`
		Config         map[string]string `json:"config"`
		EnvOverrides   map[string]string `json:"env_overrides"`
		MemoryBytes    int64             `json:"memory_bytes"`
		CPUMillicores  int64             `json:"cpu_millicores"`
		Resources      *struct {
			MemoryMB      int64 `json:"memory_mb"`
			CPUMillicores int64 `json:"cpu_millicores"`
		} `json:"resources"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	envOverrides := req.EnvOverrides
	if len(envOverrides) == 0 && len(req.Config) > 0 {
		envOverrides = req.Config
	}
	memoryBytes := req.MemoryBytes
	cpuMillicores := req.CPUMillicores
	if req.Resources != nil {
		if req.Resources.MemoryMB > 0 && memoryBytes <= 0 {
			memoryBytes = req.Resources.MemoryMB * 1024 * 1024
		}
		if req.Resources.CPUMillicores > 0 && cpuMillicores <= 0 {
			cpuMillicores = req.Resources.CPUMillicores
		}
	}
	initiatedBy := ""
	ownerUsername := ""
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		initiatedBy = claims.PlatformUserID
		ownerUsername = claims.Username
	}
	// Resolve namespace ID from the environment's namespace.
	namespaceID := ""
	if envObj != nil {
		namespaceID = envObj.NamespaceID
	}
	res, err := h.provision.Handle(r.Context(), commands.ProvisionWorkloadCommand{
		NamespaceID:    namespaceID,
		OrganizationID: effectiveOrgID,
		ProjectID:      envObj.ID,
		EnvironmentID:  envObj.ID,
		OwnerID:        req.OwnerID,
		OwnerUsername:  ownerUsername,
		ServerName:     req.ServerName,
		BlueprintID:    req.BlueprintID,
		Image:          req.Image,
		InitiatedBy:    initiatedBy,
		EnvOverrides:   envOverrides,
		MemoryBytes:    memoryBytes,
		CPUMillicores:  cpuMillicores,
	})
	if err != nil {
		h.logger.Error("provision workload", "error", err, "environment_id", envObj.ID)
		status := http.StatusBadRequest
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(lower, "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, res)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "env")
	orgID := h.callerOrganizationID(r)
	envObj, _, err := h.ensureEnvironmentAccess(r, slug, envSlug, orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	workloads, err := h.repo.ListByProject(r.Context(), envObj.ID)
	if err != nil {
		h.logger.Error("list workloads", "error", err, "environment_id", envObj.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list workloads"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workloads": workloads})
}

func (h *Handler) listLegacy(w http.ResponseWriter, r *http.Request) {
	envID := chi.URLParam(r, "projectID")
	orgID := h.callerOrganizationID(r)
	if _, _, err := h.ensureEnvironmentAccessByID(r, envID, orgID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	workloads, err := h.repo.ListByProject(r.Context(), envID)
	if err != nil {
		h.logger.Error("list workloads", "error", err, "environment_id", envID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list workloads"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workloads": workloads})
}

func (h *Handler) provisionWorkloadLegacy(w http.ResponseWriter, r *http.Request) {
	envID := chi.URLParam(r, "projectID")
	orgID := h.callerOrganizationID(r)
	envObj, effectiveOrgID, err := h.ensureEnvironmentAccessByID(r, envID, orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	if h.projects != nil {
		if claims, ok := middleware.ClaimsFromContext(r.Context()); ok && claims.PlatformUserID != "" {
			member, memberErr := h.projects.GetMember(r.Context(), envObj.ID, claims.PlatformUserID)
			if memberErr == nil && projectdomain.RoleRank(member.Role) < projectdomain.RoleRank(projectdomain.RoleDeveloper) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: requires developer role or higher"})
				return
			}
		}
	}

	var req struct {
		OrganizationID string            `json:"organization_id"`
		OwnerID        string            `json:"owner_id"`
		ServerName     string            `json:"server_name"`
		BlueprintID    string            `json:"blueprint_id"`
		Image          string            `json:"image"`
		Config         map[string]string `json:"config"`
		EnvOverrides   map[string]string `json:"env_overrides"`
		MemoryBytes    int64             `json:"memory_bytes"`
		CPUMillicores  int64             `json:"cpu_millicores"`
		Resources      *struct {
			MemoryMB      int64 `json:"memory_mb"`
			CPUMillicores int64 `json:"cpu_millicores"`
		} `json:"resources"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	envOverrides := req.EnvOverrides
	if len(envOverrides) == 0 && len(req.Config) > 0 {
		envOverrides = req.Config
	}
	memoryBytes := req.MemoryBytes
	cpuMillicores := req.CPUMillicores
	if req.Resources != nil {
		if req.Resources.MemoryMB > 0 && memoryBytes <= 0 {
			memoryBytes = req.Resources.MemoryMB * 1024 * 1024
		}
		if req.Resources.CPUMillicores > 0 && cpuMillicores <= 0 {
			cpuMillicores = req.Resources.CPUMillicores
		}
	}
	initiatedBy := ""
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		initiatedBy = claims.PlatformUserID
	}
	res, err := h.provision.Handle(r.Context(), commands.ProvisionWorkloadCommand{
		OrganizationID: effectiveOrgID,
		ProjectID:      envObj.ID,
		EnvironmentID:  envObj.ID,
		OwnerID:        req.OwnerID,
		ServerName:     req.ServerName,
		BlueprintID:    req.BlueprintID,
		Image:          req.Image,
		InitiatedBy:    initiatedBy,
		EnvOverrides:   envOverrides,
		MemoryBytes:    memoryBytes,
		CPUMillicores:  cpuMillicores,
	})
	if err != nil {
		h.logger.Error("provision workload", "error", err, "environment_id", envObj.ID)
		status := http.StatusBadRequest
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(lower, "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, res)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	workload, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workload not found"})
		return
	}
	orgID := h.callerOrganizationID(r)
	if orgID != "" && workload.OrganizationID != orgID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: workload does not belong to caller organization"})
		return
	}
	writeJSON(w, http.StatusOK, workload)
}

func (h *Handler) getForProject(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "env")
	id := chi.URLParam(r, "id")
	orgID := h.callerOrganizationID(r)
	if _, _, err := h.ensureEnvironmentAccess(r, slug, envSlug, orgID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	workload, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workload not found"})
		return
	}
	writeJSON(w, http.StatusOK, workload)
}

func (h *Handler) updateStatus(w http.ResponseWriter, r *http.Request) {
	workloadID := chi.URLParam(r, "id")
	var req struct {
		Status        string  `json:"status"`
		RuntimeRef    string  `json:"runtime_ref"`
		Endpoint      string  `json:"endpoint"`
		NodeID        string  `json:"node_id"`
		ErrorMessage  string  `json:"error_message"`
		ObservedAt    string  `json:"observed_at"`
		CPUMillicores int64   `json:"cpu_millicores"`
		MemoryMB      int64   `json:"memory_mb"`
		NetworkRxMB   float64 `json:"network_rx_mb"`
		NetworkTxMB   float64 `json:"network_tx_mb"`
		DiskReadMB    float64 `json:"disk_read_mb"`
		DiskWriteMB   float64 `json:"disk_write_mb"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	status := domain.WorkloadState(req.Status)
	if !isValidWorkloadState(status) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "status must be one of: pending, running, stopped, deleted, failed"})
		return
	}

	existing, err := h.repo.FindByID(r.Context(), workloadID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "workload not found"})
			return
		}
		h.logger.Error("load workload before status update", "error", err, "workload_id", workloadID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist workload status"})
		return
	}

	observedAt := time.Now().UTC()
	if req.ObservedAt != "" {
		if parsed, err := time.Parse(time.RFC3339, req.ObservedAt); err == nil {
			observedAt = parsed.UTC()
		}
	}
	nodeID := req.NodeID
	if claims, ok := middleware.NodeClaimsFromContext(r.Context()); ok {
		nodeID = claims.NodeID
	}
	if nodeID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if existing.NodeID != "" && existing.NodeID != nodeID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden: workload is bound to a different node"})
		return
	}

	update := domain.DaemonStatusUpdate{
		WorkloadID:    workloadID,
		Status:        status,
		RuntimeRef:    req.RuntimeRef,
		Endpoint:      req.Endpoint,
		NodeID:        nodeID,
		ErrorMessage:  req.ErrorMessage,
		ObservedAt:    observedAt,
		CPUMillicores: req.CPUMillicores,
		MemoryMB:      req.MemoryMB,
		NetworkRxMB:   req.NetworkRxMB,
		NetworkTxMB:   req.NetworkTxMB,
		DiskReadMB:    req.DiskReadMB,
		DiskWriteMB:   req.DiskWriteMB,
	}
	if err := h.repo.UpdateFromDaemon(r.Context(), update); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "workload not found"})
			return
		}
		h.logger.Error("update workload status", "error", err, "workload_id", workloadID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to persist workload status"})
		return
	}

	if h.usageRepo != nil && (req.CPUMillicores > 0 || req.MemoryMB > 0) {
		const scrapeIntervalSeconds = 30.0
		usageRecord := &usagedomain.UsageRecord{
			ID:             ids.New(),
			OrganizationID: existing.OrganizationID,
			ProjectID:      existing.ProjectID,
			GameServerID:   workloadID,
			NodeID:         nodeID,
			RecordedAt:     observedAt,
			CPUSeconds:     float64(req.CPUMillicores) / 1000.0 * scrapeIntervalSeconds,
			MemoryGBHours:  float64(req.MemoryMB) / 1024.0 * (scrapeIntervalSeconds / 3600.0),
			NetworkInMB:    req.NetworkRxMB,
			NetworkOutMB:   req.NetworkTxMB,
			DiskReadMB:     req.DiskReadMB,
			DiskWriteMB:    req.DiskWriteMB,
			CPUMillicores:  req.CPUMillicores,
			MemoryMB:       req.MemoryMB,
			NetworkInKbps:  req.NetworkRxMB * 1024.0 / scrapeIntervalSeconds,
			NetworkOutKbps: req.NetworkTxMB * 1024.0 / scrapeIntervalSeconds,
			DiskReadKbps:   req.DiskReadMB * 1024.0 / scrapeIntervalSeconds,
			DiskWriteKbps:  req.DiskWriteMB * 1024.0 / scrapeIntervalSeconds,
		}
		if err := h.usageRepo.Save(r.Context(), usageRecord); err != nil {
			h.logger.Warn("save usage record", "error", err, "workload_id", workloadID)
		}

		if h.metricsSink != nil {
			sample := &ports.MetricSample{
				WorkloadID:    workloadID,
				WorkloadName:  existing.Name,
				NodeID:        nodeID,
				OrgID:         existing.OrganizationID,
				ProjectID:     existing.ProjectID,
				Timestamp:     observedAt.Unix(),
				CPUMillicores: req.CPUMillicores,
				MemoryMB:      req.MemoryMB,
				NetworkRxMB:   req.NetworkRxMB,
				NetworkTxMB:   req.NetworkTxMB,
				DiskReadMB:    req.DiskReadMB,
				DiskWriteMB:   req.DiskWriteMB,
			}
			if err := h.metricsSink.IngestWorkloadMetrics(r.Context(), sample); err != nil {
				h.logger.Warn("ingest metrics to observability plugin", "error", err, "workload_id", workloadID)
			}
		}
	}

	if h.bus != nil {
		_ = h.bus.Publish(r.Context(), domain.WorkloadStatusChanged{
			WorkloadID: workloadID,
			Status:     status,
			NodeID:     nodeID,
			Endpoint:   req.Endpoint,
		})
	}

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (h *Handler) installMod(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workloadID := chi.URLParam(r, "id")
	orgID := h.callerOrganizationID(r)
	if _, err := h.ensureProjectAccess(r, projectID, orgID); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	var req struct {
		DownloadURL string `json:"download_url"`
		FileName    string `json:"file_name"`
		ContentType string `json:"content_type"`
		StoragePath string `json:"storage_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	if req.DownloadURL == "" || req.FileName == "" || req.ContentType == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "download_url, file_name, and content_type are required"})
		return
	}
	if req.StoragePath == "" {
		req.StoragePath = "/data"
	}
	payload := queue.ModInstallPayload{
		ServerID:    workloadID,
		ProjectID:   projectID,
		DownloadURL: req.DownloadURL,
		FileName:    req.FileName,
		ContentType: req.ContentType,
		StoragePath: req.StoragePath,
	}
	job, err := queue.NewJob(queue.JobTypeModInstall, workloadID, payload, 3)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build job"})
		return
	}
	if err := h.publisher.Enqueue(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted", "job_id": job.JobID})
}

func (h *Handler) uninstallMod(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workloadID := chi.URLParam(r, "id")
	orgID := h.callerOrganizationID(r)
	if _, err := h.ensureProjectAccess(r, projectID, orgID); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	var req struct {
		FileName    string `json:"file_name"`
		ContentType string `json:"content_type"`
		StoragePath string `json:"storage_path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	if req.FileName == "" || req.ContentType == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file_name and content_type are required"})
		return
	}
	if req.StoragePath == "" {
		req.StoragePath = "/data"
	}
	payload := queue.ModUninstallPayload{
		ServerID:    workloadID,
		ProjectID:   projectID,
		FileName:    req.FileName,
		ContentType: req.ContentType,
		StoragePath: req.StoragePath,
	}
	job, err := queue.NewJob(queue.JobTypeModUninstall, workloadID, payload, 3)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build job"})
		return
	}
	if err := h.publisher.Enqueue(r.Context(), job); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted", "job_id": job.JobID})
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	h.runAction(w, r, queue.JobTypeServerStart)
}

func (h *Handler) startLegacy(w http.ResponseWriter, r *http.Request) {
	h.runActionLegacy(w, r, queue.JobTypeServerStart)
}

func (h *Handler) stop(w http.ResponseWriter, r *http.Request) {
	h.runAction(w, r, queue.JobTypeServerStop)
}

func (h *Handler) stopLegacy(w http.ResponseWriter, r *http.Request) {
	h.runActionLegacy(w, r, queue.JobTypeServerStop)
}

func (h *Handler) restart(w http.ResponseWriter, r *http.Request) {
	h.runAction(w, r, queue.JobTypeServerRestart)
}

func (h *Handler) restartLegacy(w http.ResponseWriter, r *http.Request) {
	h.runActionLegacy(w, r, queue.JobTypeServerRestart)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	h.runAction(w, r, queue.JobTypeServerDelete)
}

func (h *Handler) deleteLegacy(w http.ResponseWriter, r *http.Request) {
	h.runActionLegacy(w, r, queue.JobTypeServerDelete)
}

func (h *Handler) runAction(w http.ResponseWriter, r *http.Request, action queue.JobType) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "env")
	workloadID := chi.URLParam(r, "id")
	orgID := h.callerOrganizationID(r)
	envObj, effectiveOrgID, err := h.ensureEnvironmentAccess(r, slug, envSlug, orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	initiatedBy := ""
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		initiatedBy = claims.PlatformUserID
	}

	err = h.action.Handle(r.Context(), commands.WorkloadActionCommand{
		OrganizationID: effectiveOrgID,
		ProjectID:      envObj.ID,
		WorkloadID:     workloadID,
		Action:         action,
		InitiatedBy:    initiatedBy,
	})
	if err != nil {
		status := http.StatusBadRequest
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(lower, "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func (h *Handler) runActionLegacy(w http.ResponseWriter, r *http.Request, action queue.JobType) {
	envID := chi.URLParam(r, "projectID")
	workloadID := chi.URLParam(r, "id")
	orgID := h.callerOrganizationID(r)
	_, effectiveOrgID, err := h.ensureEnvironmentAccessByID(r, envID, orgID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "environment not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	initiatedBy := ""
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		initiatedBy = claims.PlatformUserID
	}
	err = h.action.Handle(r.Context(), commands.WorkloadActionCommand{
		OrganizationID: effectiveOrgID,
		ProjectID:      envID,
		WorkloadID:     workloadID,
		Action:         action,
		InitiatedBy:    initiatedBy,
	})
	if err != nil {
		status := http.StatusBadRequest
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(lower, "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

// ── Phase 1: Namespace-scoped workload handlers ─────────────────────────────
// These handlers support the new flat /[slug]/servers routes that bypass
// the environment layer entirely. Authorization is namespace-membership based.

// ensureNamespaceAccess returns the namespace for {slug} and verifies the
// caller is a member of that namespace (or has workload:view permission).
func (h *Handler) ensureNamespaceAccess(r *http.Request, slug string) (*nsdomain.Namespace, error) {
	ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
	if err != nil {
		return nil, err
	}
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.PlatformUserID == "" {
		return nil, fmt.Errorf("unauthorized")
	}
	// Namespace owners (ns.ID == caller personal namespace) always pass.
	if ns.ID == claims.PlatformUserID || ns.ID == claims.PersonalOrgID {
		return ns, nil
	}
	isMember, err := h.nsRepo.IsNamespaceMember(r.Context(), ns.ID, claims.PlatformUserID)
	if err != nil || !isMember {
		return nil, fmt.Errorf("forbidden: not a member of this namespace")
	}
	return ns, nil
}

func (h *Handler) listByNamespace(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.ensureNamespaceAccess(r, slug)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "namespace not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	workloads, err := h.repo.ListByNamespace(r.Context(), ns.ID)
	if err != nil {
		h.logger.Error("list workloads by namespace", "error", err, "namespace_id", ns.ID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list workloads"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workloads": workloads})
}

func (h *Handler) provisionForNamespace(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.ensureNamespaceAccess(r, slug)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "namespace not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	var req struct {
		OwnerID       string            `json:"owner_id"`
		ServerName    string            `json:"server_name"`
		BlueprintID   string            `json:"blueprint_id"`
		Image         string            `json:"image"`
		Config        map[string]string `json:"config"`
		EnvOverrides  map[string]string `json:"env_overrides"`
		MemoryBytes   int64             `json:"memory_bytes"`
		CPUMillicores int64             `json:"cpu_millicores"`
		Resources     *struct {
			MemoryMB      int64 `json:"memory_mb"`
			CPUMillicores int64 `json:"cpu_millicores"`
		} `json:"resources"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json body"})
		return
	}
	envOverrides := req.EnvOverrides
	if len(envOverrides) == 0 && len(req.Config) > 0 {
		envOverrides = req.Config
	}
	memoryBytes := req.MemoryBytes
	cpuMillicores := req.CPUMillicores
	if req.Resources != nil {
		if req.Resources.MemoryMB > 0 && memoryBytes <= 0 {
			memoryBytes = req.Resources.MemoryMB * 1024 * 1024
		}
		if req.Resources.CPUMillicores > 0 && cpuMillicores <= 0 {
			cpuMillicores = req.Resources.CPUMillicores
		}
	}
	initiatedBy := ""
	ownerUsername := ""
	ownerID := req.OwnerID
	orgID := ns.ID
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		initiatedBy = claims.PlatformUserID
		ownerUsername = claims.Username
		if ownerID == "" {
			ownerID = claims.PlatformUserID
		}
		if ns.ID == claims.PlatformUserID {
			orgID = claims.PersonalOrgID
		}
	}

	res, err := h.provision.Handle(r.Context(), commands.ProvisionWorkloadCommand{
		NamespaceID:    ns.ID,
		NamespaceSlug:  ns.Slug,
		OrganizationID: orgID,
		OwnerID:        ownerID,
		OwnerUsername:  ownerUsername,
		ServerName:     req.ServerName,
		BlueprintID:    req.BlueprintID,
		Image:          req.Image,
		InitiatedBy:    initiatedBy,
		EnvOverrides:   envOverrides,
		MemoryBytes:    memoryBytes,
		CPUMillicores:  cpuMillicores,
	})
	if err != nil {
		h.logger.Error("provision workload for namespace", "error", err, "namespace_id", ns.ID)
		status := http.StatusBadRequest
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(lower, "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, res)
}

func (h *Handler) getForNamespace(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	id := chi.URLParam(r, "id")
	if _, err := h.ensureNamespaceAccess(r, slug); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "namespace not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	workload, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workload not found"})
		return
	}
	writeJSON(w, http.StatusOK, workload)
}

func (h *Handler) startForNamespace(w http.ResponseWriter, r *http.Request) {
	h.runActionForNamespace(w, r, queue.JobTypeServerStart)
}

func (h *Handler) stopForNamespace(w http.ResponseWriter, r *http.Request) {
	h.runActionForNamespace(w, r, queue.JobTypeServerStop)
}

func (h *Handler) restartForNamespace(w http.ResponseWriter, r *http.Request) {
	h.runActionForNamespace(w, r, queue.JobTypeServerRestart)
}

func (h *Handler) deleteForNamespace(w http.ResponseWriter, r *http.Request) {
	h.runActionForNamespace(w, r, queue.JobTypeServerDelete)
}

func (h *Handler) runActionForNamespace(w http.ResponseWriter, r *http.Request, action queue.JobType) {
	slug := chi.URLParam(r, "slug")
	workloadID := chi.URLParam(r, "id")
	ns, err := h.ensureNamespaceAccess(r, slug)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "namespace not found"})
			return
		}
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}
	initiatedBy := ""
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok {
		initiatedBy = claims.PlatformUserID
	}
	err = h.action.Handle(r.Context(), commands.WorkloadActionCommand{
		OrganizationID: ns.ID, // workload.NamespaceID is always ns.ID; PersonalOrgID override caused 400s
		ProjectID:      ns.ID, // legacy compat field; daemon ignores when NamespaceID is set
		WorkloadID:     workloadID,
		Action:         action,
		InitiatedBy:    initiatedBy,
	})
	if err != nil {
		status := http.StatusBadRequest
		lower := strings.ToLower(err.Error())
		if strings.Contains(lower, "forbidden") {
			status = http.StatusForbidden
		} else if strings.Contains(lower, "not found") {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// callerOrganizationID resolves the active org from X-Organization-ID header,
// verifying membership. Falls back to the personal org derived from JWT sub.
func (h *Handler) callerOrganizationID(r *http.Request) string {
	headerOrgID := strings.TrimSpace(r.Header.Get("X-Organization-ID"))
	if headerOrgID == "" {
		headerOrgID = strings.TrimSpace(r.URL.Query().Get("organization_id"))
	}

	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.PlatformUserID == "" {
		return headerOrgID
	}

	if headerOrgID != "" {
		// Verify membership when an explicit org is requested.
		if h.orgs != nil {
			if _, err := h.orgs.GetMember(r.Context(), headerOrgID, claims.PlatformUserID); err != nil {
				return "" // not a member — access denied at ensureEnvironmentAccess
			}
		}
		return headerOrgID
	}

	// Personal org fallback.
	return claims.PersonalOrgID
}

func normalizeOrgSlug(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "_", "-")
	s = strings.ReplaceAll(s, " ", "-")
	s = orgSlugCleaner.ReplaceAllString(s, "")
	s = strings.Trim(s, "-")
	if len(s) > 40 {
		s = s[:40]
	}
	if s == "" {
		return "default"
	}
	return s
}

func isValidWorkloadState(state domain.WorkloadState) bool {
	switch state {
	case domain.WorkloadPending, domain.WorkloadRunning, domain.WorkloadStopped, domain.WorkloadDeleted, domain.WorkloadFailed:
		return true
	default:
		return false
	}
}

// proxyFiles resolves the workload's node and proxies the request to the daemon file API.
func (h *Handler) proxyFiles(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	workloadID := chi.URLParam(r, "id")

	orgID := h.callerOrganizationID(r)
	if _, err := h.ensureProjectAccess(r, projectID, orgID); err != nil {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
		return
	}

	workload, err := h.repo.FindByID(r.Context(), workloadID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workload not found"})
		return
	}
	if workload.NodeID == "" {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "workload has no assigned node"})
		return
	}

	if h.nodes == nil || h.sharedSecret == "" {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "file API not configured"})
		return
	}
	node, err := h.nodes.FindByID(r.Context(), workload.NodeID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "node not found"})
		return
	}
	if node.FileAPIURL == "" {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "node has no file API URL"})
		return
	}

	// Derive the daemon file API sub-path from the panel route.
	// Panel: /api/v1/projects/{projectID}/workloads/{id}/files[/...]
	// Daemon: /v1/{projectID}/{workloadID}/files[/...]
	suffix := ""
	fullPath := r.URL.Path
	marker := "/workloads/" + workloadID + "/files"
	if idx := strings.Index(fullPath, marker); idx >= 0 {
		suffix = fullPath[idx+len("/workloads/"+workloadID):]
	}
	target := strings.TrimRight(node.FileAPIURL, "/") + "/v1/" + projectID + "/" + workloadID + suffix
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to build proxy request"})
		return
	}
	// Forward content headers (needed for upload/import multipart).
	if ct := r.Header.Get("Content-Type"); ct != "" {
		proxyReq.Header.Set("Content-Type", ct)
	}
	proxyReq.Header.Set("Authorization", "Bearer "+h.sharedSecret)

	resp, err := h.fileClient.Do(proxyReq)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "file API unreachable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	// Copy response headers and status.
	for k, vals := range resp.Header {
		for _, v := range vals {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// ensureProjectAccess checks that the caller may access the given project.
// It returns the effective organization ID to forward to application commands:
// the caller's org when it matches the project, or "" when access was granted
// via explicit project membership (cross-org invite), which causes commands to
// skip their redundant org check.
func (h *Handler) ensureProjectAccess(r *http.Request, projectID, organizationID string) (string, error) {
	if h.projects == nil {
		return organizationID, nil
	}
	project, err := h.projects.FindByID(r.Context(), projectID)
	if err != nil {
		return "", err
	}

	h.logger.Debug("ensureProjectAccess",
		"project_id", projectID,
		"project_org", project.OrganizationID,
		"caller_org", organizationID,
	)

	// Org matches — access granted, forward caller org normally.
	if organizationID == "" || project.OrganizationID == organizationID {
		return organizationID, nil
	}

	// Org doesn't match, but caller may be an explicit project member
	// (e.g. an invited user whose personal org differs from the project owner's org).
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok && claims.Subject != "" {
		_, memberErr := h.projects.GetMember(r.Context(), projectID, claims.Subject)
		h.logger.Debug("ensureProjectAccess member check",
			"project_id", projectID,
			"subject", claims.Subject,
			"member_err", memberErr,
		)
		if memberErr == nil {
			// Return "" so commands skip the org ownership check — access
			// was already validated here via project membership.
			return "", nil
		}
	}

	return "", fmt.Errorf("forbidden: project does not belong to caller organization")
}

// ensureEnvironmentAccess checks that the caller may access the given environment.
// It returns the environment object and the effective organization ID to forward
// to application commands (same semantics as ensureProjectAccess).
func (h *Handler) ensureEnvironmentAccess(r *http.Request, namespaceSlug, envSlug, organizationID string) (*envdomain.Environment, string, error) {
	// Find namespace
	ns, err := h.nsRepo.FindBySlug(r.Context(), namespaceSlug)
	if err != nil {
		return nil, "", err
	}
	// Find environment
	env, err := h.envs.FindByNamespaceAndSlug(r.Context(), ns.ID, envSlug)
	if err != nil {
		return nil, "", err
	}

	// Org matches — forward caller org normally.
	if organizationID == "" || ns.ID == organizationID {
		return env, organizationID, nil
	}

	// Org doesn't match; check namespace membership then environment-level membership.
	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok && claims.PlatformUserID != "" {
		hasView, _ := h.nsRepo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, "environment:view", env.ID)
		if hasView {
			return env, organizationID, nil
		}
	}

	return nil, "", fmt.Errorf("forbidden: environment does not belong to caller organization")
}

func (h *Handler) ensureEnvironmentAccessByID(r *http.Request, envID, organizationID string) (*envdomain.Environment, string, error) {
	env, err := h.envs.FindByID(r.Context(), envID)
	if err != nil {
		return nil, "", err
	}

	ns, err := h.nsRepo.FindByID(r.Context(), env.NamespaceID)
	if err != nil {
		return nil, "", err
	}

	if organizationID == "" || ns.ID == organizationID {
		return env, organizationID, nil
	}

	if claims, ok := middleware.ClaimsFromContext(r.Context()); ok && claims.PlatformUserID != "" {
		hasView, _ := h.nsRepo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, "environment:view", env.ID)
		if hasView {
			return env, organizationID, nil
		}
	}

	return nil, "", fmt.Errorf("forbidden: environment does not belong to caller organization")
}