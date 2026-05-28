package ports

import (
	"context"

	"github.com/kleffio/platform/internal/core/canvas_groups/domain"
)

type Repository interface {
	ListByNamespace(ctx context.Context, namespaceID string) ([]*domain.CanvasGroup, error)
	Upsert(ctx context.Context, g *domain.CanvasGroup) error
	Delete(ctx context.Context, id string, namespaceID string) error
}
