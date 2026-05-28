package domain

import "time"

// PlatformUser is the stable, platform-owned identity record for a human actor.
// One row exists per (IDPIssuer, IDPSubject) pair; the ID never changes even if
// the user moves between IDPs or their email/username changes.
type PlatformUser struct {
	ID              string    `json:"id"`
	IDPIssuer       string    `json:"-"`
	IDPSubject      string    `json:"-"`
	Slug            string    `json:"slug"`
	IsPlatformAdmin bool      `json:"is_platform_admin"`
	PersonalOrgID   string    `json:"personal_org_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}
