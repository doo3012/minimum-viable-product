package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	jwtutil "github.com/trainheartnet/mvp-chat/internal/infrastructure/jwt"
	"github.com/trainheartnet/mvp-chat/internal/repository"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type WSHandler struct {
	mu      sync.RWMutex
	hubs    map[uuid.UUID]*Hub
	msgUC   *usecase.MessageUseCase
	wsRepo  repository.WorkspaceRepository
	memRepo repository.MemberRepository
}

func NewWSHandler(msgUC *usecase.MessageUseCase, wsRepo repository.WorkspaceRepository, memRepo repository.MemberRepository) *WSHandler {
	return &WSHandler{
		hubs:    make(map[uuid.UUID]*Hub),
		msgUC:   msgUC,
		wsRepo:  wsRepo,
		memRepo: memRepo,
	}
}

func (h *WSHandler) getOrCreateHub(workspaceID uuid.UUID) *Hub {
	h.mu.Lock()
	defer h.mu.Unlock()

	if hub, ok := h.hubs[workspaceID]; ok {
		return hub
	}

	hub := NewHub()
	h.hubs[workspaceID] = hub
	go hub.Run()
	return hub
}

type IncomingMessage struct {
	Content string `json:"content"`
}

type OutgoingMessage struct {
	ID          uuid.UUID `json:"id"`
	UserID      string    `json:"userId"`
	DisplayName string    `json:"displayName"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (h *WSHandler) HandleWS(c echo.Context) error {
	token := c.QueryParam("token")
	if token == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}

	claims, err := jwtutil.ValidateChatToken(token)
	if err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "invalid token"})
	}

	buIDStr := c.QueryParam("buId")
	buID, err := uuid.Parse(buIDStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid buId"})
	}

	// Verify token's bu_id matches requested buId
	if claims.BuID != buIDStr {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "token bu_id mismatch"})
	}

	// Verify workspace exists and user is a member
	ws, err := h.wsRepo.GetByBuID(c.Request().Context(), buID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "workspace not found"})
	}

	userID, _ := uuid.Parse(claims.Sub)
	members, err := h.memRepo.ListByWorkspace(c.Request().Context(), ws.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to check membership"})
	}

	isMember := false
	for _, m := range members {
		if m.UserID == userID {
			isMember = true
			break
		}
	}
	if !isMember {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not a workspace member"})
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
		return nil
	}

	hub := h.getOrCreateHub(ws.ID)
	client := NewClient(hub, conn, claims.Sub, claims.DisplayName)

	hub.register <- client

	onMessage := func(client *Client, raw []byte) {
		var incoming IncomingMessage
		if err := json.Unmarshal(raw, &incoming); err != nil {
			log.Printf("ws: unmarshal error: %v", err)
			return
		}

		if incoming.Content == "" {
			return
		}

		msg := &domain.Message{
			ID:          uuid.New(),
			WorkspaceID: ws.ID,
			UserID:      userID,
			DisplayName: claims.DisplayName,
			Content:     incoming.Content,
			CreatedAt:   time.Now().UTC(),
		}

		if err := h.msgUC.SaveMessage(context.Background(), msg); err != nil {
			log.Printf("ws: save message error: %v", err)
			return
		}

		outgoing := OutgoingMessage{
			ID:          msg.ID,
			UserID:      claims.Sub,
			DisplayName: claims.DisplayName,
			Content:     incoming.Content,
			CreatedAt:   msg.CreatedAt,
		}

		data, _ := json.Marshal(outgoing)
		hub.broadcast <- data
	}

	go client.WritePump()
	go client.ReadPump(onMessage)

	return nil
}
