package application

import (
	"context"
	"fmt"
	"strings"
	"unicode"

	"github.com/kleffio/platform/internal/core/identity/domain"
	"github.com/kleffio/platform/internal/core/identity/ports"
)

type IdentityService struct {
	repo         ports.UserRepository
	orgBootstrap ports.OrgBootstrapper
	nsBootstrap  ports.NsBootstrapper
}

func NewIdentityService(repo ports.UserRepository, orgBootstrap ports.OrgBootstrapper, nsBootstrap ports.NsBootstrapper) *IdentityService {
	return &IdentityService{repo: repo, orgBootstrap: orgBootstrap, nsBootstrap: nsBootstrap}
}

// Resolve returns the stable platform user for (issuer, subject).
// On the first call for a new (issuer, subject) pair the user row is created and
// their personal organization is bootstrapped.
func (s *IdentityService) Resolve(ctx context.Context, issuer, subject, username, email string) (*domain.PlatformUser, error) {
	slug := deriveSlug(username)
	u, err := s.repo.GetOrCreate(ctx, issuer, subject, slug)
	if err != nil {
		return nil, fmt.Errorf("identity: resolve: %w", err)
	}

	if u.PersonalOrgID == "" {
		orgName := "My Organization"
		if username != "" {
			orgName = username + "'s Organization"
		}
		orgID, bootErr := s.orgBootstrap.EnsurePersonalOrg(ctx, u.ID, orgName, email, username)
		if bootErr == nil {
			if setErr := s.repo.SetPersonalOrg(ctx, u.ID, orgID); setErr == nil {
				u.PersonalOrgID = orgID
			}
		}
		// Non-fatal: user can still log in; personal org is created on next attempt.
	}

	// Provision personal namespace (idempotent — safe on every login).
	if s.nsBootstrap != nil {
		nsName := username
		if nsName == "" {
			nsName = "Personal"
		}
		_ = s.nsBootstrap.EnsurePersonalNamespace(ctx, u.ID, u.Slug, nsName)
	}

	return u, nil
}

func (s *IdentityService) FindByID(ctx context.Context, id string) (*domain.PlatformUser, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *IdentityService) SetPersonalOrg(ctx context.Context, userID, orgID string) error {
	return s.repo.SetPersonalOrg(ctx, userID, orgID)
}

// deriveSlug converts a username into a URL-safe slug of at most 40 characters.
func deriveSlug(username string) string {
	s := strings.ToLower(strings.TrimSpace(username))
	var b strings.Builder
	prev := '-'
	for _, c := range s {
		if unicode.IsLetter(c) || unicode.IsDigit(c) {
			b.WriteRune(c)
			prev = c
		} else if prev != '-' {
			b.WriteRune('-')
			prev = '-'
		}
	}
	slug := strings.Trim(b.String(), "-")
	if len(slug) > 40 {
		slug = slug[:40]
	}
	if slug == "" {
		slug = "user"
	}
	return slug
}
