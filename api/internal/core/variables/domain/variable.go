package domain

import "time"

type Variable struct {
	ID            string    `json:"id"`
	EnvironmentID string    `json:"environment_id"`
	Key           string    `json:"key"`
	Value         string    `json:"value,omitempty"`
	IsSecret      bool      `json:"is_secret"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}
