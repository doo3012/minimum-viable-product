package http

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	jwtutil "github.com/trainheartnet/mvp-chat/internal/infrastructure/jwt"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type MessageHandler struct {
	uc *usecase.MessageUseCase
}

func NewMessageHandler(uc *usecase.MessageUseCase) *MessageHandler {
	return &MessageHandler{uc: uc}
}

func (h *MessageHandler) GetHistory(c echo.Context) error {
	buIDStr := c.Param("buId")
	buID, err := uuid.Parse(buIDStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid bu_id"})
	}

	// Extract user ID from Authorization header (chat JWT)
	userID := uuid.Nil
	if auth := c.Request().Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		if claims, err := jwtutil.ValidateChatToken(strings.TrimPrefix(auth, "Bearer ")); err == nil {
			userID, _ = uuid.Parse(claims.Sub)
		}
	}

	limitStr := c.QueryParam("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	messages, err := h.uc.GetHistory(c.Request().Context(), buID, userID, limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	if messages == nil {
		messages = make([]*domain.Message, 0)
	}

	return c.JSON(http.StatusOK, messages)
}
