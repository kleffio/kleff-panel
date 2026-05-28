package http

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/kleffio/platform/internal/core/namespaces/adapters/persistence"
	"github.com/kleffio/platform/internal/core/namespaces/domain"
	"github.com/kleffio/platform/internal/core/namespaces/ports"
	notificationsapp "github.com/kleffio/platform/internal/core/notifications/application"
	notificationsdomain "github.com/kleffio/platform/internal/core/notifications/domain"
	"github.com/kleffio/platform/internal/shared/ids"
	"github.com/kleffio/platform/internal/shared/middleware"
	"github.com/kleffio/platform/internal/shared/upload"
)

const base = "/api/v1/namespaces"

// Handler groups all HTTP endpoints for the namespaces module.
type Handler struct {
	repo          ports.NamespaceRepository
	notifications *notificationsapp.Service
	logger        *slog.Logger
	uploadDir     string
}

func NewHandler(repo ports.NamespaceRepository, notifications *notificationsapp.Service, logger *slog.Logger, uploadDir string) *Handler {
	return &Handler{repo: repo, notifications: notifications, logger: logger, uploadDir: uploadDir}
}

// RegisterRoutes attaches all namespace routes to the provided router.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/api/v1/permissions", h.listPermissions)

	r.Get(base, h.list)
	r.Post(base, h.create)
	r.Get(base+"/slug-check", h.checkSlug)
	r.Get(base+"/{slug}", h.get)
	r.Patch(base+"/{slug}", h.update)
	r.Delete(base+"/{slug}", h.delete)
	r.Post(base+"/{slug}/avatar", h.uploadAvatar)

	// Roles
	r.Get(base+"/{slug}/roles", h.listRoles)
	r.Post(base+"/{slug}/roles", h.createRole)
	r.Patch(base+"/{slug}/roles/{roleId}", h.updateRole)
	r.Delete(base+"/{slug}/roles/{roleId}", h.deleteRole)
	r.Get(base+"/{slug}/roles/{roleId}/permissions", h.listRolePermissions)
	r.Put(base+"/{slug}/roles/{roleId}/permissions", h.setRolePermissions)

	// Members
	r.Get(base+"/{slug}/members", h.listMembers)
	r.Patch(base+"/{slug}/members/{userId}", h.updateMemberRole)
	r.Delete(base+"/{slug}/members/{userId}", h.removeMember)

	// Per-member overrides
	r.Get(base+"/{slug}/members/{userId}/overrides", h.listOverrides)
	r.Put(base+"/{slug}/members/{userId}/overrides/{pkey}", h.setOverride)
	r.Delete(base+"/{slug}/members/{userId}/overrides/{pkey}", h.deleteOverride)
	r.Get(base+"/{slug}/my-permissions", h.getMyPermissions)

	// Invites
	r.Get(base+"/{slug}/invites", h.listInvites)
	r.Post(base+"/{slug}/invites", h.createInvite)
	r.Delete(base+"/{slug}/invites/{inviteId}", h.revokeInvite)

	// Public invite resolution
	r.Get("/api/v1/ns-invites/{token}", h.resolveInvite)
	r.Post("/api/v1/ns-invites/{token}/accept", h.acceptInvite)

	// Environment Access Grants
	r.Get(base+"/{slug}/environments/{envSlug}/access", h.listEnvironmentGrants)
	r.Post(base+"/{slug}/environments/{envSlug}/access", h.addEnvironmentGrant)
	r.Delete(base+"/{slug}/environments/{envSlug}/access/{userId}", h.removeEnvironmentGrant)
	r.Patch(base+"/{slug}/environments/{envSlug}/access/settings", h.setEnvironmentLimitedAccess)

	r.Get("/api/v1/me/shared-projects", h.listSharedProjects)

	// User search
	r.Get("/api/v1/users/search", h.searchUsers)
}

// ── Permissions ───────────────────────────────────────────────────────────────

func (h *Handler) listPermissions(w http.ResponseWriter, r *http.Request) {
	perms, err := h.repo.ListPermissions(r.Context())
	if err != nil {
		h.logger.Error("list permissions", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list permissions"))
		return
	}
	if perms == nil {
		perms = []*domain.Permission{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"permissions": perms})
}

func (h *Handler) getMyPermissions(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	ns, err := h.repo.FindBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, errBody("namespace not found"))
		} else {
			h.logger.Error("find namespace", "slug", slug, "error", err)
			writeJSON(w, http.StatusInternalServerError, errBody("failed to find namespace"))
		}
		return
	}

	envID := r.URL.Query().Get("env_id")

	perms, err := h.repo.ListEffectivePermissions(r.Context(), ns.ID, claims.PlatformUserID, envID)
	if err != nil {
		h.logger.Error("list effective permissions", "ns", ns.ID, "user", claims.PlatformUserID, "env", envID, "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list permissions"))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"permissions": perms})
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}
	namespaces, err := h.repo.ListByUserID(r.Context(), claims.PlatformUserID)
	if err != nil {
		h.logger.Error("list namespaces", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list namespaces"))
		return
	}
	if namespaces == nil {
		namespaces = []*domain.Namespace{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"namespaces": namespaces})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	var req struct {
		Name        string `json:"name"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, errBody("name is required"))
		return
	}

	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = slugify(name)
	}
	if !validSlug(slug) {
		writeJSON(w, http.StatusBadRequest, errBody("slug must be lowercase letters, numbers, and hyphens only"))
		return
	}

	now := time.Now().UTC()
	ns := &domain.Namespace{
		ID:          ids.New(),
		Type:        "org",
		Slug:        slug,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	store, ok := h.repo.(*persistence.PostgresNamespaceStore)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errBody("internal error"))
		return
	}
	if err := store.NewOrgNamespace(r.Context(), ns, claims.PlatformUserID); err != nil {
		if errors.Is(err, persistence.ErrSlugTaken) {
			writeJSON(w, http.StatusConflict, errBody("slug is already taken"))
			return
		}
		h.logger.Error("create namespace", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to create namespace"))
		return
	}

	writeJSON(w, http.StatusCreated, ns)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.repo.FindBySlug(r.Context(), slug)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, errBody("namespace not found"))
		return
	}
	if err != nil {
		h.logger.Error("get namespace", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("internal error"))
		return
	}

	// Auto-repair: If this is a personal namespace, ensure the 'Member' role has basic permissions.
	// This fixes existing namespaces created before the permission seeding fix.
	if ns.Type == "user" {
		_ = h.repo.EnsurePersonalMemberPermissions(r.Context(), ns.ID)
	}

	writeJSON(w, http.StatusOK, ns)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "namespace:manage")
	if err != nil {
		writeNSError(w, err)
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AvatarURL   string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		ns.Name = strings.TrimSpace(req.Name)
	}
	ns.Description = strings.TrimSpace(req.Description)
	ns.AvatarURL = strings.TrimSpace(req.AvatarURL)
	ns.UpdatedAt = time.Now().UTC()

	if err := h.repo.Update(r.Context(), ns); err != nil {
		h.logger.Error("update namespace", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to update namespace"))
		return
	}
	writeJSON(w, http.StatusOK, ns)
}

func (h *Handler) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "namespace:manage")
	if err != nil {
		writeNSError(w, err)
		return
	}

	const maxSize = 5 << 20 // 5 MiB
	url, err := upload.SaveImage(r, "avatar", h.uploadDir, "avatars", maxSize)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errBody(err.Error()))
		return
	}

	ns.AvatarURL = url
	ns.UpdatedAt = time.Now().UTC()
	if err := h.repo.Update(r.Context(), ns); err != nil {
		h.logger.Error("update namespace avatar", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to save avatar"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"avatar_url": url})
}

func (h *Handler) delete(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "namespace:manage")
	if err != nil {
		writeNSError(w, err)
		return
	}
	if ns.Type == "user" {
		writeJSON(w, http.StatusForbidden, errBody("cannot delete a user namespace"))
		return
	}
	if err := h.repo.Delete(r.Context(), ns.ID); err != nil {
		h.logger.Error("delete namespace", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to delete namespace"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) checkSlug(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(r.URL.Query().Get("slug"))
	if slug == "" || !validSlug(slug) {
		writeJSON(w, http.StatusOK, map[string]bool{"available": false})
		return
	}
	store, ok := h.repo.(*persistence.PostgresNamespaceStore)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errBody("internal error"))
		return
	}
	available, err := store.SlugAvailable(r.Context(), slug)
	if err != nil {
		h.logger.Error("check slug", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to check slug"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"available": available})
}

// ── Roles ─────────────────────────────────────────────────────────────────────

func (h *Handler) listRoles(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:view")
	if err != nil {
		writeNSError(w, err)
		return
	}
	roles, err := h.repo.ListRoles(r.Context(), ns.ID)
	if err != nil {
		h.logger.Error("list roles", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list roles"))
		return
	}
	// Attach permission keys to each role.
	for _, role := range roles {
		keys, _ := h.repo.ListRolePermissions(r.Context(), role.ID)
		role.Permissions = keys
	}
	if roles == nil {
		roles = []*domain.Role{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"roles": roles})
}

func (h *Handler) createRole(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}

	var req struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeJSON(w, http.StatusBadRequest, errBody("name is required"))
		return
	}

	now := time.Now().UTC()
	role := &domain.Role{
		ID:          ids.New(),
		NamespaceID: ns.ID,
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		IsSystem:    false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := h.repo.SaveRole(r.Context(), role); err != nil {
		h.logger.Error("create role", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to create role"))
		return
	}
	if len(req.Permissions) > 0 {
		_ = h.repo.SetRolePermissions(r.Context(), role.ID, req.Permissions)
		role.Permissions = req.Permissions
	}
	writeJSON(w, http.StatusCreated, role)
}

func (h *Handler) updateRole(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}

	roleID := chi.URLParam(r, "roleId")
	role, err := h.repo.GetRole(r.Context(), roleID)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusNotFound, errBody("role not found"))
		return
	}
	if err != nil || role.NamespaceID != ns.ID {
		writeJSON(w, http.StatusNotFound, errBody("role not found"))
		return
	}
	if role.IsSystem {
		writeJSON(w, http.StatusForbidden, errBody("cannot modify system roles"))
		return
	}

	var req struct {
		Name        string   `json:"name"`
		Description string   `json:"description"`
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if strings.TrimSpace(req.Name) != "" {
		role.Name = strings.TrimSpace(req.Name)
	}
	role.Description = strings.TrimSpace(req.Description)
	role.UpdatedAt = time.Now().UTC()

	if err := h.repo.UpdateRole(r.Context(), role); err != nil {
		h.logger.Error("update role", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to update role"))
		return
	}
	if req.Permissions != nil {
		_ = h.repo.SetRolePermissions(r.Context(), role.ID, req.Permissions)
		role.Permissions = req.Permissions
	}
	writeJSON(w, http.StatusOK, role)
}

func (h *Handler) deleteRole(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}

	roleID := chi.URLParam(r, "roleId")
	role, err := h.repo.GetRole(r.Context(), roleID)
	if err == sql.ErrNoRows || (err == nil && role.NamespaceID != ns.ID) {
		writeJSON(w, http.StatusNotFound, errBody("role not found"))
		return
	}
	if role.IsSystem {
		writeJSON(w, http.StatusForbidden, errBody("cannot delete system roles"))
		return
	}
	if err := h.repo.DeleteRole(r.Context(), roleID); err != nil {
		h.logger.Error("delete role", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to delete role"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) listRolePermissions(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:view")
	if err != nil {
		writeNSError(w, err)
		return
	}
	roleID := chi.URLParam(r, "roleId")
	role, err := h.repo.GetRole(r.Context(), roleID)
	if err == sql.ErrNoRows || (err == nil && role.NamespaceID != ns.ID) {
		writeJSON(w, http.StatusNotFound, errBody("role not found"))
		return
	}
	keys, err := h.repo.ListRolePermissions(r.Context(), roleID)
	if err != nil {
		h.logger.Error("list role permissions", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list permissions"))
		return
	}
	if keys == nil {
		keys = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"permissions": keys})
}

func (h *Handler) setRolePermissions(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}
	roleID := chi.URLParam(r, "roleId")
	role, err := h.repo.GetRole(r.Context(), roleID)
	if err == sql.ErrNoRows || (err == nil && role.NamespaceID != ns.ID) {
		writeJSON(w, http.StatusNotFound, errBody("role not found"))
		return
	}
	if role.IsSystem && role.Name == "Owner" {
		writeJSON(w, http.StatusForbidden, errBody("cannot modify Owner role permissions"))
		return
	}

	var req struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if err := h.repo.SetRolePermissions(r.Context(), roleID, req.Permissions); err != nil {
		h.logger.Error("set role permissions", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to set permissions"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"permissions": req.Permissions})
}

// ── Members ───────────────────────────────────────────────────────────────────

func (h *Handler) listMembers(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:view")
	if err != nil {
		writeNSError(w, err)
		return
	}
	members, err := h.repo.ListMembers(r.Context(), ns.ID)
	if err != nil {
		h.logger.Error("list members", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list members"))
		return
	}
	if members == nil {
		members = []*domain.Member{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

func (h *Handler) updateMemberRole(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}
	userID := chi.URLParam(r, "userId")

	var req struct {
		RoleID string `json:"role_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if req.RoleID == "" {
		writeJSON(w, http.StatusBadRequest, errBody("role_id is required"))
		return
	}
	role, err := h.repo.GetRole(r.Context(), req.RoleID)
	if err == sql.ErrNoRows || (err == nil && role.NamespaceID != ns.ID) {
		writeJSON(w, http.StatusBadRequest, errBody("role not found in this namespace"))
		return
	}
	if err := h.repo.UpdateMemberRole(r.Context(), ns.ID, userID, req.RoleID); err != nil {
		h.logger.Error("update member role", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to update role"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"role_id": req.RoleID})
}

func (h *Handler) removeMember(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	userID := chi.URLParam(r, "userId")

	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	perm := "member:remove"
	if claims.PlatformUserID == userID {
		perm = "namespace:view" // members may remove themselves
	}
	ns, err := h.authorizedNS(r, slug, perm)
	if err != nil {
		writeNSError(w, err)
		return
	}
	if err := h.repo.RemoveMember(r.Context(), ns.ID, userID); err != nil {
		h.logger.Error("remove member", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to remove member"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Per-member overrides ──────────────────────────────────────────────────────

func (h *Handler) listOverrides(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}
	userID := chi.URLParam(r, "userId")
	overrides, err := h.repo.ListOverrides(r.Context(), ns.ID, userID)
	if err != nil {
		h.logger.Error("list overrides", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list overrides"))
		return
	}
	if overrides == nil {
		overrides = []*domain.PermissionOverride{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"overrides": overrides})
}

func (h *Handler) setOverride(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}

	userID := chi.URLParam(r, "userId")
	pkey := chi.URLParam(r, "pkey")

	var req struct {
		Effect string `json:"effect"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if req.Effect != "allow" && req.Effect != "deny" {
		writeJSON(w, http.StatusBadRequest, errBody("effect must be 'allow' or 'deny'"))
		return
	}
	o := &domain.PermissionOverride{
		NamespaceID:   ns.ID,
		UserID:        userID,
		PermissionKey: pkey,
		Effect:        req.Effect,
	}
	if err := h.repo.SetOverride(r.Context(), o); err != nil {
		h.logger.Error("set override", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to set override"))
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (h *Handler) deleteOverride(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:manage_roles")
	if err != nil {
		writeNSError(w, err)
		return
	}
	userID := chi.URLParam(r, "userId")
	pkey := chi.URLParam(r, "pkey")

	if err := h.repo.DeleteOverride(r.Context(), ns.ID, userID, pkey); err != nil {
		h.logger.Error("delete override", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to delete override"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── Invites ───────────────────────────────────────────────────────────────────

func (h *Handler) listInvites(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	ns, err := h.authorizedNS(r, slug, "member:invite")
	if err != nil {
		writeNSError(w, err)
		return
	}
	invites, err := h.repo.ListInvites(r.Context(), ns.ID)
	if err != nil {
		h.logger.Error("list invites", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list invites"))
		return
	}
	if invites == nil {
		invites = []*domain.Invite{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"invites": invites})
}

func (h *Handler) createInvite(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}
	ns, err := h.authorizedNS(r, slug, "member:invite")
	if err != nil {
		writeNSError(w, err)
		return
	}

	var req struct {
		Email              string `json:"email"`    // set for email invite
		RoleID             string `json:"role_id"`  // optional; defaults to Member
		MaxUses            *int   `json:"max_uses"` // set for shareable link
		Days               int    `json:"days"`     // expiry days (default 7)
		GrantEnvironmentID string `json:"grant_environment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody("invalid json body"))
		return
	}
	if req.Email == "" && req.MaxUses == nil {
		writeJSON(w, http.StatusBadRequest, errBody("provide email (email invite) or max_uses (shareable link)"))
		return
	}

	days := req.Days
	if days <= 0 || days > 30 {
		days = 7
	}

	rawToken, err := generateToken()
	if err != nil {
		h.logger.Error("generate invite token", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to generate invite"))
		return
	}

	now := time.Now().UTC()
	inv := &domain.Invite{
		ID:          ids.New(),
		NamespaceID: ns.ID,
		RoleID:      req.RoleID,
		InvitedEmail: func() string {
			if req.Email != "" {
				return strings.ToLower(strings.TrimSpace(req.Email))
			}
			return ""
		}(),
		MaxUses:            req.MaxUses,
		Token:              rawToken,
		TokenHash:          persistence.HashToken(rawToken),
		InvitedBy:          claims.PlatformUserID,
		ExpiresAt:          now.Add(time.Duration(days) * 24 * time.Hour),
		CreatedAt:          now,
		GrantEnvironmentID: req.GrantEnvironmentID,
	}

	if err := h.repo.CreateInvite(r.Context(), inv); err != nil {
		h.logger.Error("create invite", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to create invite"))
		return
	}

	if h.notifications != nil {
		// Notify the person who sent the invite.
		if inv.InvitedEmail != "" {
			_, _ = h.notifications.Create(r.Context(), notificationsapp.CreateInput{
				UserID: claims.PlatformUserID,
				Type:   notificationsdomain.TypeOrgInvitation,
				Title:  "Invitation sent",
				Body:   fmt.Sprintf("An invitation was sent to %s to join %s.", inv.InvitedEmail, slug),
				Data:   map[string]any{"namespace_slug": slug, "invite_id": inv.ID, "invited_email": inv.InvitedEmail},
			})
			// Also notify the invited user if they already have a platform account.
			if inviteeID, err := h.repo.FindUserIDByEmail(r.Context(), inv.InvitedEmail); err == nil && inviteeID != "" {
				_, _ = h.notifications.Create(r.Context(), notificationsapp.CreateInput{
					UserID: inviteeID,
					Type:   notificationsdomain.TypeOrgInvitation,
					Title:  "You've been invited",
					Body:   fmt.Sprintf("You were invited to join %s.", slug),
					Data:   map[string]any{"namespace_slug": slug, "invite_id": inv.ID, "token": inv.Token},
				})
			}
		}
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":            inv.ID,
		"namespace_id":  inv.NamespaceID,
		"role_id":       inv.RoleID,
		"invited_email": inv.InvitedEmail,
		"max_uses":      inv.MaxUses,
		"token":         inv.Token,
		"expires_at":    inv.ExpiresAt,
		"created_at":    inv.CreatedAt,
	})
}

func (h *Handler) revokeInvite(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	inviteID := chi.URLParam(r, "inviteId")
	if _, err := h.authorizedNS(r, slug, "member:invite"); err != nil {
		writeNSError(w, err)
		return
	}
	if err := h.repo.RevokeInvite(r.Context(), inviteID); err != nil {
		h.logger.Error("revoke invite", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to revoke invite"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) resolveInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	tokenHash := persistence.HashToken(token)
	inv, err := h.repo.FindInviteByToken(r.Context(), tokenHash)
	if err == sql.ErrNoRows || err != nil {
		writeJSON(w, http.StatusNotFound, errBody("invite not found or expired"))
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		writeJSON(w, http.StatusGone, errBody("invite has expired"))
		return
	}
	if inv.InvitedEmail != "" && inv.AcceptedAt != nil {
		writeJSON(w, http.StatusGone, errBody("invite already accepted"))
		return
	}
	ns, err := h.repo.FindByID(r.Context(), inv.NamespaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody("failed to load namespace"))
		return
	}
	var grantEnvSlug string
	if inv.GrantEnvironmentID != "" {
		grantEnvSlug, _, _ = h.repo.FindEnvironmentByID(r.Context(), inv.GrantEnvironmentID)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":                     inv.ID,
		"namespace_id":           inv.NamespaceID,
		"namespace_name":         ns.Name,
		"namespace_slug":         ns.Slug,
		"role_id":                inv.RoleID,
		"role_name":              inv.RoleName,
		"invited_email":          inv.InvitedEmail,
		"max_uses":               inv.MaxUses,
		"use_count":              inv.UseCount,
		"expires_at":             inv.ExpiresAt,
		"grant_environment_id":   inv.GrantEnvironmentID,
		"grant_environment_slug": grantEnvSlug,
	})
}

func (h *Handler) acceptInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	tokenHash := persistence.HashToken(token)

	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}

	inv, err := h.repo.FindInviteByToken(r.Context(), tokenHash)
	if err == sql.ErrNoRows || err != nil {
		writeJSON(w, http.StatusNotFound, errBody("invite not found or expired"))
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		writeJSON(w, http.StatusGone, errBody("invite has expired"))
		return
	}

	if inv.InvitedEmail != "" {
		// Email invite: single-use
		if inv.AcceptedAt != nil {
			writeJSON(w, http.StatusGone, errBody("invite already accepted"))
			return
		}
		if err := h.repo.AcceptInvite(r.Context(), inv.ID,
			claims.PlatformUserID, claims.Email, claims.Username); err != nil {
			h.logger.Error("accept email invite", "error", err)
			writeJSON(w, http.StatusInternalServerError, errBody("failed to accept invite"))
			return
		}
	} else {
		// Shareable link: multi-use
		if err := h.repo.IncrementInviteUseCount(r.Context(), inv.ID,
			claims.PlatformUserID, claims.Email, claims.Username); err != nil {
			h.logger.Error("accept shareable invite", "error", err)
			writeJSON(w, http.StatusInternalServerError, fmt.Errorf("%w", err).Error())
			return
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"namespace_id": inv.NamespaceID})
}

// ── Environment Access Grants ────────────────────────────────────────────────

func (h *Handler) listEnvironmentGrants(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "envSlug")
	ns, err := h.authorizedNS(r, slug, "environment:manage")
	if err != nil { writeNSError(w, err); return }
	envID, err := h.repo.FindEnvironmentByNSAndSlug(r.Context(), ns.ID, envSlug)
	if err != nil { writeJSON(w, http.StatusNotFound, errBody("environment not found")); return }

	limited, err := h.repo.GetEnvironmentLimitedAccess(r.Context(), envID)
	if err != nil { writeJSON(w, http.StatusInternalServerError, errBody("failed to load environment")); return }

	grants, err := h.repo.ListEnvironmentGrants(r.Context(), envID)
	if err != nil { writeJSON(w, http.StatusInternalServerError, errBody("failed to list grants")); return }
	if grants == nil { grants = []*domain.EnvAccessGrant{} }
	writeJSON(w, http.StatusOK, map[string]any{"limited_access": limited, "grants": grants})
}

func (h *Handler) addEnvironmentGrant(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "envSlug")
	ns, err := h.authorizedNS(r, slug, "environment:manage")
	if err != nil { writeNSError(w, err); return }
	envID, err := h.repo.FindEnvironmentByNSAndSlug(r.Context(), ns.ID, envSlug)
	if err != nil { writeJSON(w, http.StatusNotFound, errBody("environment not found")); return }

	var req struct {
		UserID string `json:"user_id"`
		RoleID string `json:"role_id"` // optional env-scoped role override
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeJSON(w, http.StatusBadRequest, errBody("invalid body")); return }
	if req.UserID == "" { writeJSON(w, http.StatusBadRequest, errBody("user_id required")); return }

	claims, _ := middleware.ClaimsFromContext(r.Context())
	if err := h.repo.AddEnvironmentGrant(r.Context(), envID, req.UserID, claims.PlatformUserID, req.RoleID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody("failed to add grant"))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"user_id": req.UserID, "role_id": req.RoleID})
}

func (h *Handler) removeEnvironmentGrant(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "envSlug")
	userID := chi.URLParam(r, "userId")
	ns, err := h.authorizedNS(r, slug, "environment:manage")
	if err != nil { writeNSError(w, err); return }
	envID, err := h.repo.FindEnvironmentByNSAndSlug(r.Context(), ns.ID, envSlug)
	if err != nil { writeJSON(w, http.StatusNotFound, errBody("environment not found")); return }

	if err := h.repo.RemoveEnvironmentGrant(r.Context(), envID, userID); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody("failed to remove grant"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setEnvironmentLimitedAccess(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	envSlug := chi.URLParam(r, "envSlug")
	ns, err := h.authorizedNS(r, slug, "environment:manage")
	if err != nil { writeNSError(w, err); return }
	envID, err := h.repo.FindEnvironmentByNSAndSlug(r.Context(), ns.ID, envSlug)
	if err != nil { writeJSON(w, http.StatusNotFound, errBody("environment not found")); return }

	var req struct {
		LimitedAccess bool `json:"limited_access"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { writeJSON(w, http.StatusBadRequest, errBody("invalid body")); return }

	if err := h.repo.SetEnvironmentLimitedAccess(r.Context(), envID, req.LimitedAccess); err != nil {
		writeJSON(w, http.StatusInternalServerError, errBody("failed to update access settings"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"limited_access": req.LimitedAccess})
}

func (h *Handler) listSharedProjects(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}
	projects, err := h.repo.ListSharedProjects(r.Context(), claims.PlatformUserID)
	if err != nil {
		h.logger.Error("list shared projects", "user", claims.PlatformUserID, "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to list shared projects"))
		return
	}
	if projects == nil {
		projects = []*domain.SharedProject{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

func (h *Handler) searchUsers(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeJSON(w, http.StatusOK, map[string]any{"users": []any{}})
		return
	}
	results, err := h.repo.SearchUsers(r.Context(), q, claims.PlatformUserID)
	if err != nil {
		h.logger.Error("search users", "error", err)
		writeJSON(w, http.StatusInternalServerError, errBody("failed to search users"))
		return
	}
	if results == nil {
		results = []*domain.UserSearchResult{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": results})
}

// ── Access guard ──────────────────────────────────────────────────────────────

// authorizedNS loads a namespace by slug and verifies the caller has the given permission.
func (h *Handler) authorizedNS(r *http.Request, slug, permissionKey string) (*domain.Namespace, error) {
	claims, ok := middleware.ClaimsFromContext(r.Context())
	if !ok {
		return nil, fmt.Errorf("unauthorized")
	}
	ns, err := h.repo.FindBySlug(r.Context(), slug)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("not found")
	}
	if err != nil {
		return nil, fmt.Errorf("internal")
	}

	// Phase 3: Personal namespace isolation (Owners have full access, others check permissions)
	if ns.Type == "user" && ns.ID != claims.PlatformUserID {
		// Allow guests to proceed to the permission check. 
		// If they have no roles in this namespace/environment, HasPermission will block them.
	}

	ok2, err := h.repo.HasPermission(r.Context(), ns.ID, claims.PlatformUserID, permissionKey, "")
	if err != nil {
		return nil, fmt.Errorf("internal")
	}
	if !ok2 {
		return nil, fmt.Errorf("forbidden")
	}
	return ns, nil
}

// ── Helpers ───────────────────────────────────────────────────────────────────

var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$`)

func validSlug(s string) bool {
	return slugRe.MatchString(s)
}

func slugify(name string) string {
	var sb strings.Builder
	for _, ch := range strings.ToLower(name) {
		if unicode.IsLetter(ch) || unicode.IsDigit(ch) {
			sb.WriteRune(ch)
		} else if sb.Len() > 0 {
			sb.WriteByte('-')
		}
	}
	s := strings.TrimRight(sb.String(), "-")
	if s == "" {
		s = "ns"
	}
	return s
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func writeNSError(w http.ResponseWriter, err error) {
	switch err.Error() {
	case "unauthorized":
		writeJSON(w, http.StatusUnauthorized, errBody("unauthorized"))
	case "forbidden":
		writeJSON(w, http.StatusForbidden, errBody("forbidden"))
	case "not found":
		writeJSON(w, http.StatusNotFound, errBody("namespace not found"))
	default:
		writeJSON(w, http.StatusInternalServerError, errBody("internal error"))
	}
}

func errBody(msg string) map[string]string {
	return map[string]string{"error": msg}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
