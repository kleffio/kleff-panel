package middleware

import (
	"net/http"

	"github.com/kleffio/platform/internal/core/identity/application"
)

// UserResolver resolves the stable platform user from (issuer, subject) and
// writes PlatformUserID, Slug, IsPlatformAdmin, and PersonalOrgID back onto
// the Claims pointer already stored in context by RequireAuth.
// Must be used after RequireAuth.
func UserResolver(svc *application.IdentityService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, _ := ClaimsFromContext(r.Context()) //nolint:errcheck
			if claims == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			u, err := svc.Resolve(r.Context(), claims.Issuer, claims.Subject, claims.Username, claims.Email)
			if err != nil {
				http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
				return
			}
			claims.PlatformUserID = u.ID
			claims.Slug = u.Slug
			claims.IsPlatformAdmin = u.IsPlatformAdmin
			claims.PersonalOrgID = u.PersonalOrgID
			next.ServeHTTP(w, r)
		})
	}
}
