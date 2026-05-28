package http

import (
    "database/sql"
    "encoding/json"
    "net/http"
    "strings"
    "time"

    "github.com/go-chi/chi/v5"
    "github.com/kleffio/platform/internal/core/environments/domain"
    envports "github.com/kleffio/platform/internal/core/environments/ports"
    nsports "github.com/kleffio/platform/internal/core/namespaces/ports"
    "github.com/kleffio/platform/internal/shared/ids"
    "github.com/kleffio/platform/internal/shared/middleware"
    "log/slog"
)

type Handler struct{
    repo envports.EnvironmentRepository
    nsRepo nsports.NamespaceRepository
    logger *slog.Logger
}

func NewHandler(repo envports.EnvironmentRepository, nsRepo nsports.NamespaceRepository, logger *slog.Logger) *Handler {
    return &Handler{repo: repo, nsRepo: nsRepo, logger: logger}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
    r.Get("/api/v1/namespaces/{slug}/environments", h.list)
    r.Post("/api/v1/namespaces/{slug}/environments", h.create)
    r.Get("/api/v1/namespaces/{slug}/environments/{env}", h.get)
    r.Patch("/api/v1/namespaces/{slug}/environments/{env}", h.update)
    r.Delete("/api/v1/namespaces/{slug}/environments/{env}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
    claims, ok := middleware.ClaimsFromContext(r.Context())
    if !ok {
        writeJSON(w, http.StatusUnauthorized, map[string]string{"error":"unauthorized"})
        return
    }

    slug := chi.URLParam(r, "slug")
    ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
    if err != nil || ns == nil {
        writeJSON(w, http.StatusNotFound, map[string]string{"error":"namespace not found"})
        return
    }
    envs, err := h.repo.ListByNamespace(r.Context(), ns.ID)
    if err != nil {
        h.logger.Error("list envs", "error", err)
        writeJSON(w, http.StatusInternalServerError, map[string]string{"error":"failed to list environments"})
        return
    }

	var filtered []*domain.Environment
	for _, env := range envs {
		hasAccess, _ := h.nsRepo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, "environment:view", env.ID)
		if hasAccess {
			filtered = append(filtered, env)
		}
	}

	if filtered == nil {
		filtered = []*domain.Environment{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"environments": filtered})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
    claims, ok := middleware.ClaimsFromContext(r.Context())
    if !ok { writeJSON(w, http.StatusUnauthorized, map[string]string{"error":"unauthorized"}); return }
    slug := chi.URLParam(r, "slug")
    ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
    if err != nil || ns == nil { writeJSON(w, http.StatusNotFound, map[string]string{"error":"namespace not found"}); return }
    // check permission
    okp, err := h.nsRepo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, "environment:create", "")
    if err != nil || !okp { writeJSON(w, http.StatusForbidden, map[string]string{"error":"forbidden"}); return }

    var req struct{ Name, Slug, Description string; IsPrivate bool }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error":"invalid body"}); return }
    if strings.TrimSpace(req.Name) == "" { writeJSON(w, http.StatusBadRequest, map[string]string{"error":"name required"}); return }
    env := &domain.Environment{
        ID: ids.New(), NamespaceID: ns.ID, Name: strings.TrimSpace(req.Name), Slug: strings.TrimSpace(req.Slug), Description: strings.TrimSpace(req.Description), IsPrivate: req.IsPrivate, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
    }
    if env.Slug == "" { env.Slug = ids.New()[:8] }
    if err := h.repo.Save(r.Context(), env); err != nil { h.logger.Error("create env", "error", err); writeJSON(w, http.StatusInternalServerError, map[string]string{"error":"failed to create"}); return }

	if req.IsPrivate {
		_ = h.nsRepo.SetEnvironmentLimitedAccess(r.Context(), env.ID, true)
		_ = h.nsRepo.AddEnvironmentGrant(r.Context(), env.ID, claims.PlatformUserID, "", "")
	}

    writeJSON(w, http.StatusCreated, env)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
    claims, _ := middleware.ClaimsFromContext(r.Context())
    slug := chi.URLParam(r, "slug")
    envSlug := chi.URLParam(r, "env")
    ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
    if err != nil || ns == nil { writeJSON(w, http.StatusNotFound, map[string]string{"error":"namespace not found"}); return }
    env, err := h.repo.FindByNamespaceAndSlug(r.Context(), ns.ID, envSlug)
    if err == sql.ErrNoRows { writeJSON(w, http.StatusNotFound, map[string]string{"error":"environment not found"}); return }
    if err != nil { h.logger.Error("get env", "error", err); writeJSON(w, http.StatusInternalServerError, map[string]string{"error":"internal"}); return }


    // check permission
    userID := ""
    if claims != nil { userID = claims.PlatformUserID }
    okp, err := h.nsRepo.HasPermission(r.Context(), ns.ID, userID, "environment:view", env.ID)
    if err != nil || !okp { writeJSON(w, http.StatusForbidden, map[string]string{"error":"forbidden"}); return }

    writeJSON(w, http.StatusOK, env)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
    claims, ok := middleware.ClaimsFromContext(r.Context())
    if !ok { writeJSON(w, http.StatusUnauthorized, map[string]string{"error":"unauthorized"}); return }
    slug := chi.URLParam(r, "slug")
    envSlug := chi.URLParam(r, "env")
    ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
    if err != nil || ns == nil { writeJSON(w, http.StatusNotFound, map[string]string{"error":"namespace not found"}); return }
    env, err := h.repo.FindByNamespaceAndSlug(r.Context(), ns.ID, envSlug)
    if err != nil { writeJSON(w, http.StatusNotFound, map[string]string{"error":"environment not found"}); return }
    okp, err := h.nsRepo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, "environment:manage", env.ID)
    if err != nil || !okp { writeJSON(w, http.StatusForbidden, map[string]string{"error":"forbidden"}); return }
    var req struct{ Name, Description string; IsPrivate *bool; Profile *string }
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeJSON(w, http.StatusBadRequest, map[string]string{"error":"invalid body"}); return }
    if strings.TrimSpace(req.Name) != "" { env.Name = strings.TrimSpace(req.Name) }
    if req.Description != "" { env.Description = req.Description }
    if req.IsPrivate != nil { env.IsPrivate = *req.IsPrivate }
    if req.Profile != nil && (*req.Profile == "simple" || *req.Profile == "advanced") { env.Profile = *req.Profile }
    env.UpdatedAt = time.Now().UTC()
    if err := h.repo.Update(r.Context(), env); err != nil { h.logger.Error("update env", "error", err); writeJSON(w, http.StatusInternalServerError, map[string]string{"error":"failed to update"}); return }
    writeJSON(w, http.StatusOK, env)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
    claims, ok := middleware.ClaimsFromContext(r.Context())
    if !ok { writeJSON(w, http.StatusUnauthorized, map[string]string{"error":"unauthorized"}); return }
    slug := chi.URLParam(r, "slug")
    envSlug := chi.URLParam(r, "env")
    ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
    if err != nil || ns == nil { writeJSON(w, http.StatusNotFound, map[string]string{"error":"namespace not found"}); return }
    env, err := h.repo.FindByNamespaceAndSlug(r.Context(), ns.ID, envSlug)
    if err != nil { writeJSON(w, http.StatusNotFound, map[string]string{"error":"environment not found"}); return }
    okp, err := h.nsRepo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, "environment:delete", env.ID)
    if err != nil || !okp { writeJSON(w, http.StatusForbidden, map[string]string{"error":"forbidden"}); return }
    if err := h.repo.Delete(r.Context(), env.ID); err != nil { h.logger.Error("delete env", "error", err); writeJSON(w, http.StatusInternalServerError, map[string]string{"error":"failed to delete"}); return }
    w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    _ = json.NewEncoder(w).Encode(body)
}
