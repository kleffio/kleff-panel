package ports

import (
	"context"

	"github.com/kleffio/platform/internal/core/variables/domain"
)

type VariableRepository interface {
	ListByEnvironment(ctx context.Context, environmentID string) ([]*domain.Variable, error)
	FindByID(ctx context.Context, id string) (*domain.Variable, error)
	Save(ctx context.Context, v *domain.Variable) error
	Update(ctx context.Context, v *domain.Variable) error
	Delete(ctx context.Context, id string) error
}
