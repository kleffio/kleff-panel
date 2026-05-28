package http

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	envports "github.com/kleffio/platform/internal/core/environments/ports"
	nsports "github.com/kleffio/platform/internal/core/namespaces/ports"
	"github.com/kleffio/platform/internal/core/variables/domain"
	varports "github.com/kleffio/platform/internal/core/variables/ports"
	"github.com/kleffio/platform/internal/shared/ids"
	"github.com/kleffio/platform/internal/shared/middleware"
)

type Handler struct {
	repo    varports.VariableRepository
	envRepo envports.EnvironmentRepository
	nsRepo  nsports.NamespaceRepository
	logger  *slog.Logger
}

func NewHandler(
	repo varports.VariableRepository,
	envRepo envports.EnvironmentRepository,
	nsRepo nsports.NamespaceRepository,
	logger *slog.Logger,
) *Handler {
	return &Handler{repo: repo, envRepo: envRepo, nsRepo: nsRepo, logger: logger}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/api/v1/namespaces/{slug}/environments/{env}/variables", h.list)
	r.Post("/api/v1/namespaces/{slug}/environments/{env}/variables", h.create)
	r.Put("/api/v1/namespaces/{slug}/environments/{env}/variables/{id}", h.update)
	r.Delete("/api/v1/namespaces/{slug}/environments/{env}/variables/{id}", h.delete)
}

func (h *Handler) resolveEnv(r *http.Request) (nsID, envID string, ok bool, httpStatus int) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "env")

	ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
	if err != nil || ns == nil {
		return "", "", false, http.StatusNotFound
	}
	env, err := h.envRepo.FindByNamespaceAndSlug(r.Context(), ns.ID, envSlug)
	if err == sql.ErrNoRows || env == nil {
		return "", "", false, http.StatusNotFound
	}
	if err != nil {
		return "", "", false, http.StatusInternalServerError
	}
	return ns.ID, env.ID, true, http.StatusOK
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	_, envID, ok, status := h.resolveEnv(r)
	if !ok {
		writeJSON(w, status, map[string]string{"error": "not found"})
		return
	}
	vars, err := h.repo.ListByEnvironment(r.Context(), envID)
	if err != nil {
		h.logger.Error("list variables", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list variables"})
		return
	}
	// Mask secret values in list response
	out := make([]*domain.Variable, len(vars))
	for i, v := range vars {
		cp := *v
		if cp.IsSecret {
			cp.Value = ""
		}
		out[i] = &cp
	}
	writeJSON(w, http.StatusOK, map[string]any{"variables": out})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	nsID, envID, resolved, status := h.resolveEnv(r)
	if !resolved {
		writeJSON(w, status, map[string]string{"error": "not found"})
		return
	}
	okp, err := h.nsRepo.HasPermission(r.Context(), nsID, claims.PlatformUserID, "variable:create", envID)
	if err != nil || !okp {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	var req struct {
		Key      string `json:"key"`
		Value    string `json:"value"`
		IsSecret bool   `json:"is_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if strings.TrimSpace(req.Key) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "key required"})
		return
	}

	v := &domain.Variable{
		ID:            ids.New(),
		EnvironmentID: envID,
		Key:           strings.TrimSpace(req.Key),
		Value:         req.Value,
		IsSecret:      req.IsSecret,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	}
	if err := h.repo.Save(r.Context(), v); err != nil {
		h.logger.Error("create variable", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to create variable"})
		return
	}
	resp := *v
	if resp.IsSecret {
		resp.Value = ""
	}
	writeJSON(w, http.StatusCreated, &resp)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	nsID, envID2, resolved, status := h.resolveEnv(r)
	if !resolved {
		writeJSON(w, status, map[string]string{"error": "not found"})
		return
	}
	okp, err := h.nsRepo.HasPermission(r.Context(), nsID, claims.PlatformUserID, "variable:manage", envID2)
	if err != nil || !okp {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	varID := chi.URLParam(r, "id")
	v, err := h.repo.FindByID(r.Context(), varID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "variable not found"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal"})
		return
	}

	var req struct {
		Key      *string `json:"key"`
		Value    *string `json:"value"`
		IsSecret *bool   `json:"is_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if req.Key != nil && strings.TrimSpace(*req.Key) != "" {
		v.Key = strings.TrimSpace(*req.Key)
	}
	if req.Value != nil {
		v.Value = *req.Value
	}
	if req.IsSecret != nil {
		v.IsSecret = *req.IsSecret
	}

	if err := h.repo.Update(r.Context(), v); err != nil {
		h.logger.Error("update variable", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update variable"})
		return
	}
	resp := *v
	if resp.IsSecret {
		resp.Value = ""
	}
	writeJSON(w, http.StatusOK, &resp)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	nsID, envID3, resolved, status := h.resolveEnv(r)
	if !resolved {
		writeJSON(w, status, map[string]string{"error": "not found"})
		return
	}
	okp, err := h.nsRepo.HasPermission(r.Context(), nsID, claims.PlatformUserID, "variable:delete", envID3)
	if err != nil || !okp {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	varID := chi.URLParam(r, "id")
	if err := h.repo.Delete(r.Context(), varID); err != nil {
		h.logger.Error("delete variable", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete variable"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
