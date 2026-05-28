package ports

import (
    "context"
    "github.com/kleffio/platform/internal/core/environments/domain"
)

// EnvironmentRepository defines persistence operations for environments.
type EnvironmentRepository interface {
    FindByID(ctx context.Context, id string) (*domain.Environment, error)
    FindByNamespaceAndSlug(ctx context.Context, namespaceID, slug string) (*domain.Environment, error)
    ListByNamespace(ctx context.Context, namespaceID string) ([]*domain.Environment, error)
    Save(ctx context.Context, e *domain.Environment) error
    Update(ctx context.Context, e *domain.Environment) error
    Delete(ctx context.Context, id string) error
}
