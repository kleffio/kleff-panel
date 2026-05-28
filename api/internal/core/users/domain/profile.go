// Package domain contains the pure business types for the users module.
package domain

import "time"

// ThemePreference controls the UI colour scheme for a user.
type ThemePreference string

const (
	ThemeSystem ThemePreference = "system"
	ThemeLight  ThemePreference = "light"
	ThemeDark   ThemePreference = "dark"
)

// UIMode controls whether the user sees simple or advanced navigation.
type UIMode string

const (
	UIModeSimple   UIMode = "simple"
	UIModeAdvanced UIMode = "advanced"
)

// UserProfile is a user's editable identity within the platform.
type UserProfile struct {
	ID              string          `json:"id"`
	UserID          string          `json:"-"`
	Username        *string         `json:"username,omitempty"`
	AvatarURL       *string         `json:"avatar_url,omitempty"`
	Bio             *string         `json:"bio,omitempty"`
	ThemePreference ThemePreference `json:"theme_preference"`
	UIMode          UIMode          `json:"ui_mode"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// UpdateInput holds the mutable fields a user may change.
type UpdateInput struct {
	Bio             *string
	ThemePreference *ThemePreference
	AvatarURL       *string
	UIMode          *UIMode
}
