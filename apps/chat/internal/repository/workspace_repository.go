package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/trainheartnet/mvp-chat/internal/domain"
)

type WorkspaceRepository interface {
	Create(ctx context.Context, w *domain.Workspace) error
	GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error)
}

type MemberRepository interface {
	Add(ctx context.Context, m *domain.WorkspaceMember) error
	Remove(ctx context.Context, workspaceID, userID uuid.UUID) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error)
}
