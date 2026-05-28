package http

import (
	"encoding/json"
	"net/http"

	"github.com/kleffio/platform/internal/shared/middleware"
)

type IdentityHandler struct{}

func NewIdentityHandler() *IdentityHandler {
	return &IdentityHandler{}
}

// GetMe returns the stable platform identity for the authenticated user.
func (h *IdentityHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"user_id":           claims.PlatformUserID,
		"id":                claims.PlatformUserID,
		"slug":              claims.Slug,
		"is_platform_admin": claims.IsPlatformAdmin,
		"personal_org_id":   claims.PersonalOrgID,
	})
}
