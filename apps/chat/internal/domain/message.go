package domain

import (
	"time"

	"github.com/google/uuid"
)

type Message struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	UserID      uuid.UUID
	DisplayName string
	Content     string
	CreatedAt   time.Time
}
