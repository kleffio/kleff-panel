package domain

import "time"

type CanvasGroup struct {
	ID          string    `json:"id"`
	NamespaceID string    `json:"namespace_id"`
	Label       string    `json:"label"`
	Color       string    `json:"color"`
	MemberIDs   []string  `json:"member_ids"`
	Notes       string    `json:"notes"`
	Role        string    `json:"role"`
	PosX        float64   `json:"pos_x"`
	PosY        float64   `json:"pos_y"`
	Width       float64   `json:"width"`
	Height      float64   `json:"height"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
