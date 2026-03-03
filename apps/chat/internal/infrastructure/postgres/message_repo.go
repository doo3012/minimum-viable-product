package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type messageRepo struct {
	pool *pgxpool.Pool
}

func NewMessageRepo(pool *pgxpool.Pool) repository.MessageRepository {
	return &messageRepo{pool: pool}
}

func (r *messageRepo) Insert(ctx context.Context, m *domain.Message) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO chat.messages (id, workspace_id, user_id, display_name, content, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		m.ID, m.WorkspaceID, m.UserID, m.DisplayName, m.Content, m.CreatedAt)
	return err
}

func (r *messageRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.Message, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, display_name, content, created_at
		 FROM chat.messages
		 WHERE workspace_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*domain.Message
	for rows.Next() {
		m := &domain.Message{}
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.DisplayName, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}

	// Reverse to get chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}
