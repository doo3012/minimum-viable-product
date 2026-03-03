package http

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/trainheartnet/mvp-chat/internal/domain"
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

	limitStr := c.QueryParam("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	messages, err := h.uc.GetHistory(c.Request().Context(), buID, limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	if messages == nil {
		messages = make([]*domain.Message, 0)
	}

	return c.JSON(http.StatusOK, messages)
}
