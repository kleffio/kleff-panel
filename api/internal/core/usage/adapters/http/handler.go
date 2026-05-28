package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	nsports "github.com/kleffio/platform/internal/core/namespaces/ports"
	usagedomain "github.com/kleffio/platform/internal/core/usage/domain"
	usageports "github.com/kleffio/platform/internal/core/usage/ports"
)

const basePath = "/api/v1/usage"

type Handler struct {
	repo   usageports.UsageRepository
	nsRepo nsports.NamespaceRepository
	logger *slog.Logger
}

func NewHandler(repo usageports.UsageRepository, nsRepo nsports.NamespaceRepository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, nsRepo: nsRepo, logger: logger}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get(basePath+"/metrics", h.getMetrics)
}

func (h *Handler) RegisterAdminRoutes(r chi.Router) {
	r.Get("/api/v1/admin/usage/metrics", h.getAllMetrics)
}

// getAllMetrics returns the latest per-workload metrics snapshot across all projects (admin only).
func (h *Handler) getAllMetrics(w http.ResponseWriter, r *http.Request) {
	metrics, err := h.repo.ListLatestAll(r.Context())
	if err != nil {
		h.logger.Error("list all metrics", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch metrics"})
		return
	}
	if metrics == nil {
		metrics = []*usagedomain.WorkloadMetrics{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"workloads": metrics})
}

// getMetrics returns the latest per-workload metrics snapshot.
// Query params (one required): project_id, environment_id, or namespace_slug
func (h *Handler) getMetrics(w http.ResponseWriter, r *http.Request) {
	nsSlug := r.URL.Query().Get("namespace_slug")
	if nsSlug != "" {
		ns, err := h.nsRepo.FindBySlug(r.Context(), nsSlug)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "namespace not found"})
				return
			}
			h.logger.Error("find namespace for metrics", "error", err, "slug", nsSlug)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch metrics"})
			return
		}
		metrics, err := h.repo.ListLatestByNamespace(r.Context(), ns.ID)
		if err != nil {
			h.logger.Error("list metrics by namespace", "error", err, "namespace_id", ns.ID)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch metrics"})
			return
		}
		if metrics == nil {
			metrics = []*usagedomain.WorkloadMetrics{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"workloads": metrics})
		return
	}

	envID := r.URL.Query().Get("environment_id")
	projectID := r.URL.Query().Get("project_id")
	// Prefer environment_id when present (newer API); fall back to project_id for compatibility.
	if envID != "" {
		projectID = envID
	}
	if projectID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "project_id, environment_id, or namespace_slug is required"})
		return
	}

	metrics, err := h.repo.ListLatestByProject(r.Context(), projectID)
	if err != nil {
		h.logger.Error("list metrics by project", "error", err, "project_id", projectID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to fetch metrics"})
		return
	}

	if metrics == nil {
		metrics = []*usagedomain.WorkloadMetrics{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"workloads": metrics})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
