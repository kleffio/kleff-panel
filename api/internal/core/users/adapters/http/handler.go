// Package http exposes REST endpoints for the users module.
package http

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/kleffio/platform/internal/core/users/application"
	"github.com/kleffio/platform/internal/core/users/domain"
	"github.com/kleffio/platform/internal/shared/middleware"
	"github.com/kleffio/platform/internal/shared/upload"
)

const basePath = "/api/v1/users"

// Handler groups all HTTP endpoints for the users module.
type Handler struct {
	svc       *application.Service
	uploadDir string
	log       *slog.Logger
}

// NewHandler creates a Handler.
func NewHandler(svc *application.Service, uploadDir string, log *slog.Logger) *Handler {
	return &Handler{svc: svc, uploadDir: uploadDir, log: log}
}

// RegisterRoutes attaches all user routes to the provided router.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get(basePath+"/me", h.getMe)
	r.Patch(basePath+"/me", h.updateMe)
	r.Post(basePath+"/me/avatar", h.uploadAvatar)
	r.Get(basePath+"/{username}", h.getPublicProfile)
}

func (h *Handler) getMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	profile, err := h.svc.GetOrCreate(r.Context(), claims.PlatformUserID, claims.Username)
	if err != nil {
		h.log.Error("getMe: GetOrCreate failed", "error", err, "user_id", claims.PlatformUserID)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to load profile"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": profile})
}

func (h *Handler) updateMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	var body struct {
		Bio             *string                 `json:"bio"`
		ThemePreference *domain.ThemePreference `json:"theme_preference"`
		UIMode          *domain.UIMode          `json:"ui_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid request body"))
		return
	}

	profile, err := h.svc.Update(r.Context(), claims.PlatformUserID, domain.UpdateInput{
		Bio:             body.Bio,
		ThemePreference: body.ThemePreference,
		UIMode:          body.UIMode,
	})
	if err != nil {
		h.log.Error("updateMe: Update failed", "error", err, "user_id", claims.PlatformUserID)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to update profile"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": profile})
}

func (h *Handler) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	const maxSize = 5 << 20 // 5 MiB
	url, err := upload.SaveImage(r, "avatar", h.uploadDir, "avatars", maxSize)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	}

	profile, err := h.svc.Update(r.Context(), claims.PlatformUserID, domain.UpdateInput{AvatarURL: &url})
	if err != nil {
		h.log.Error("uploadAvatar: Update failed", "error", err, "user_id", claims.PlatformUserID)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to save avatar"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": profile})
}

func (h *Handler) getPublicProfile(w http.ResponseWriter, r *http.Request) {
	username := chi.URLParam(r, "username")
	if username == "" {
		writeJSON(w, http.StatusBadRequest, errBody("missing username"))
		return
	}

	profile, err := h.svc.GetPublicProfile(r.Context(), username)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errBody("profile not found"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"username":   profile.Username,
			"avatar_url": profile.AvatarURL,
			"bio":        profile.Bio,
		},
	})
}

func errBody(msg string) map[string]string {
	return map[string]string{"error": msg}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
