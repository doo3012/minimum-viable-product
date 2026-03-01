package usecase

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type WorkspaceUseCase interface {
	Provision(ctx context.Context, buID uuid.UUID, name string, ownerID uuid.UUID) error
	AddMember(ctx context.Context, workspaceID, userID uuid.UUID) error
	RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
	ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error)
}

type workspaceUseCase struct {
	wsRepo  repository.WorkspaceRepository
	memRepo repository.MemberRepository
}

func NewWorkspaceUseCase(ws repository.WorkspaceRepository, mem repository.MemberRepository) WorkspaceUseCase {
	return &workspaceUseCase{ws, mem}
}

func (uc *workspaceUseCase) Provision(ctx context.Context, buID uuid.UUID, name string, ownerID uuid.UUID) error {
	ws := &domain.Workspace{
		ID: uuid.New(), BuID: buID, Name: name, CreatedAt: time.Now(),
	}
	if err := uc.wsRepo.Create(ctx, ws); err != nil {
		return err
	}
	member := &domain.WorkspaceMember{
		ID: uuid.New(), WorkspaceID: ws.ID,
		UserID: ownerID, Role: domain.RoleAdmin, CreatedAt: time.Now(),
	}
	return uc.memRepo.Add(ctx, member)
}

func (uc *workspaceUseCase) AddMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	m := &domain.WorkspaceMember{
		ID: uuid.New(), WorkspaceID: workspaceID,
		UserID: userID, Role: domain.RoleMember, CreatedAt: time.Now(),
	}
	return uc.memRepo.Add(ctx, m)
}

func (uc *workspaceUseCase) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
	return uc.memRepo.Remove(ctx, workspaceID, userID)
}

func (uc *workspaceUseCase) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error) {
	return uc.memRepo.ListByWorkspace(ctx, workspaceID)
}

func (uc *workspaceUseCase) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
	return uc.wsRepo.GetByID(ctx, id)
}
