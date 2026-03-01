package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type workspaceRepo struct{ pool *pgxpool.Pool }

func NewWorkspaceRepo(pool *pgxpool.Pool) repository.WorkspaceRepository {
	return &workspaceRepo{pool}
}

func (r *workspaceRepo) Create(ctx context.Context, w *domain.Workspace) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO chat.workspaces (id, bu_id, name, created_at)
         VALUES ($1, $2, $3, $4)`,
		w.ID, w.BuID, w.Name, w.CreatedAt)
	return err
}

func (r *workspaceRepo) GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, bu_id, name, created_at FROM chat.workspaces WHERE bu_id = $1`, buID)
	w := &domain.Workspace{}
	err := row.Scan(&w.ID, &w.BuID, &w.Name, &w.CreatedAt)
	return w, err
}

func (r *workspaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, bu_id, name, created_at FROM chat.workspaces WHERE id = $1`, id)
	w := &domain.Workspace{}
	err := row.Scan(&w.ID, &w.BuID, &w.Name, &w.CreatedAt)
	return w, err
}
