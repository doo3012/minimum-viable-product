package usecase

import (
	"context"

	"github.com/google/uuid"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type MessageUseCase struct {
	msgRepo repository.MessageRepository
	wsUC    WorkspaceUseCase
}

func NewMessageUseCase(msgRepo repository.MessageRepository, wsUC WorkspaceUseCase) *MessageUseCase {
	return &MessageUseCase{msgRepo: msgRepo, wsUC: wsUC}
}

func (uc *MessageUseCase) GetHistory(ctx context.Context, buID uuid.UUID, userID uuid.UUID, limit int) ([]*domain.Message, error) {
	ws, err := uc.wsUC.EnsureWorkspace(ctx, buID, userID)
	if err != nil {
		return nil, err
	}
	return uc.msgRepo.ListByWorkspace(ctx, ws.ID, limit)
}

func (uc *MessageUseCase) SaveMessage(ctx context.Context, msg *domain.Message) error {
	return uc.msgRepo.Insert(ctx, msg)
}
