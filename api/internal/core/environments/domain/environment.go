package domain

import "time"

// Environment represents a deployable environment owned by a namespace.
type Environment struct {
    ID          string    `json:"id"`
    NamespaceID string    `json:"namespace_id"`
    Slug        string    `json:"slug"`
    Name        string    `json:"name"`
    Description string    `json:"description,omitempty"`
    IsPrivate   bool      `json:"is_private"`
    Profile     string    `json:"profile"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}
