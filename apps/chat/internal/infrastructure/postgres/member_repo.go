package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type memberRepo struct{ pool *pgxpool.Pool }

func NewMemberRepo(pool *pgxpool.Pool) repository.MemberRepository {
	return &memberRepo{pool}
}

func (r *memberRepo) Add(ctx context.Context, m *domain.WorkspaceMember) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO chat.workspace_members (id, workspace_id, user_id, role, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
		m.ID, m.WorkspaceID, m.UserID, string(m.Role), m.CreatedAt)
	return err
}

func (r *memberRepo) Remove(ctx context.Context, workspaceID, userID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM chat.workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		workspaceID, userID)
	return err
}

func (r *memberRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, role, created_at
         FROM chat.workspace_members WHERE workspace_id = $1`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []*domain.WorkspaceMember
	for rows.Next() {
		m := &domain.WorkspaceMember{}
		var role string
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &role, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.Role = domain.MemberRole(role)
		members = append(members, m)
	}
	return members, rows.Err()
}
