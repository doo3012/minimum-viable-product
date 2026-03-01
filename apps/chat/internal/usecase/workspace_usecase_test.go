package usecase_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type MockWorkspaceRepo struct{ mock.Mock }

func (m *MockWorkspaceRepo) Create(ctx context.Context, w *domain.Workspace) error {
	return m.Called(ctx, w).Error(0)
}
func (m *MockWorkspaceRepo) GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error) {
	args := m.Called(ctx, buID)
	return args.Get(0).(*domain.Workspace), args.Error(1)
}
func (m *MockWorkspaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
	args := m.Called(ctx, id)
	return args.Get(0).(*domain.Workspace), args.Error(1)
}

type MockMemberRepo struct{ mock.Mock }

func (m *MockMemberRepo) Add(ctx context.Context, mem *domain.WorkspaceMember) error {
	return m.Called(ctx, mem).Error(0)
}
func (m *MockMemberRepo) Remove(ctx context.Context, wsID, userID uuid.UUID) error {
	return m.Called(ctx, wsID, userID).Error(0)
}
func (m *MockMemberRepo) ListByWorkspace(ctx context.Context, wsID uuid.UUID) ([]*domain.WorkspaceMember, error) {
	args := m.Called(ctx, wsID)
	return args.Get(0).([]*domain.WorkspaceMember), args.Error(1)
}

func TestProvisionWorkspace(t *testing.T) {
	wsRepo := new(MockWorkspaceRepo)
	memRepo := new(MockMemberRepo)

	buID := uuid.New()
	ownerID := uuid.New()

	wsRepo.On("Create", mock.Anything, mock.MatchedBy(func(w *domain.Workspace) bool {
		return w.BuID == buID
	})).Return(nil)
	memRepo.On("Add", mock.Anything, mock.MatchedBy(func(m *domain.WorkspaceMember) bool {
		return m.UserID == ownerID && m.Role == domain.RoleAdmin
	})).Return(nil)

	uc := usecase.NewWorkspaceUseCase(wsRepo, memRepo)
	err := uc.Provision(context.Background(), buID, "Default", ownerID)

	assert.NoError(t, err)
	wsRepo.AssertExpectations(t)
	memRepo.AssertExpectations(t)
}
