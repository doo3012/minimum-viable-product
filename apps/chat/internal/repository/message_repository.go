package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/trainheartnet/mvp-chat/internal/domain"
)

type MessageRepository interface {
	Insert(ctx context.Context, m *domain.Message) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.Message, error)
}
