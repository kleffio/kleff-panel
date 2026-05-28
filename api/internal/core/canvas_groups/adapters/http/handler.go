package http

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/kleffio/platform/internal/core/canvas_groups/domain"
	"github.com/kleffio/platform/internal/core/canvas_groups/ports"
	nsdomain "github.com/kleffio/platform/internal/core/namespaces/domain"
	nsports "github.com/kleffio/platform/internal/core/namespaces/ports"
	"github.com/kleffio/platform/internal/shared/middleware"
)

const basePath = "/api/v1/namespaces/{slug}/canvas-groups"

type Handler struct {
	repo   ports.Repository
	nsRepo nsports.NamespaceRepository
	logger *slog.Logger
}

func NewHandler(repo ports.Repository, nsRepo nsports.NamespaceRepository, logger *slog.Logger) *Handler {
	return &Handler{repo: repo, nsRepo: nsRepo, logger: logger}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get(basePath, h.list)
	r.Put(basePath+"/{id}", h.upsert)
	r.Delete(basePath+"/{id}", h.delete)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	ns, err := h.ensureAccess(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	groups, err := h.repo.ListByNamespace(r.Context(), ns.ID)
	if err != nil {
		h.logger.Error("list canvas groups", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list canvas groups"})
		return
	}
	if groups == nil {
		groups = []*domain.CanvasGroup{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"groups": groups})
}

func (h *Handler) upsert(w http.ResponseWriter, r *http.Request) {
	ns, err := h.ensureAccess(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	id := chi.URLParam(r, "id")

	var body struct {
		Label     string   `json:"label"`
		Color     string   `json:"color"`
		MemberIDs []string `json:"member_ids"`
		Notes     string   `json:"notes"`
		Role      string   `json:"role"`
		PosX      float64  `json:"pos_x"`
		PosY      float64  `json:"pos_y"`
		Width     float64  `json:"width"`
		Height    float64  `json:"height"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if body.MemberIDs == nil {
		body.MemberIDs = []string{}
	}

	g := &domain.CanvasGroup{
		ID:          id,
		NamespaceID: ns.ID,
		Label:       body.Label,
		Color:       body.Color,
		MemberIDs:   body.MemberIDs,
		Notes:       body.Notes,
		Role:        body.Role,
		PosX:        body.PosX,
		PosY:        body.PosY,
		Width:       body.Width,
		Height:      body.Height,
	}
	if err := h.repo.Upsert(r.Context(), g); err != nil {
		h.logger.Error("upsert canvas group", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save canvas group"})
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	ns, err := h.ensureAccess(r)
	if err != nil {
		writeErr(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.repo.Delete(r.Context(), id, ns.ID); err != nil {
		h.logger.Error("delete canvas group", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to delete canvas group"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ensureAccess(r *http.Request) (*nsdomain.Namespace, error) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.nsRepo.FindBySlug(r.Context(), slug)
	if err != nil {
		return nil, err
	}
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims.PlatformUserID == "" {
		return nil, fmt.Errorf("unauthorized")
	}
	if ns.ID == claims.PlatformUserID || ns.ID == claims.PersonalOrgID {
		return ns, nil
	}
	isMember, err := h.nsRepo.IsNamespaceMember(r.Context(), ns.ID, claims.PlatformUserID)
	if err != nil || !isMember {
		return nil, fmt.Errorf("forbidden: not a member of this namespace")
	}
	return ns, nil
}

func writeErr(w http.ResponseWriter, err error) {
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "namespace not found"})
		return
	}
	writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
