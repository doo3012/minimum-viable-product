package http

import (
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	jwtutil "github.com/trainheartnet/mvp-chat/internal/infrastructure/jwt"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type WorkspaceHandler struct {
	uc usecase.WorkspaceUseCase
}

func NewWorkspaceHandler(uc usecase.WorkspaceUseCase) *WorkspaceHandler {
	return &WorkspaceHandler{uc}
}

func (h *WorkspaceHandler) GetWorkspace(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
	}
	ws, err := h.uc.GetByID(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "workspace not found")
	}
	return c.JSON(http.StatusOK, ws)
}

func (h *WorkspaceHandler) GetWorkspaceByBuID(c echo.Context) error {
	buID, err := uuid.Parse(c.Param("buId"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid bu_id")
	}

	// Extract user ID from Authorization header for auto-provisioning
	userID := uuid.Nil
	if auth := c.Request().Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		if claims, err := jwtutil.ValidateChatToken(strings.TrimPrefix(auth, "Bearer ")); err == nil {
			userID, _ = uuid.Parse(claims.Sub)
		}
	}

	ws, err := h.uc.EnsureWorkspace(c.Request().Context(), buID, userID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get workspace")
	}
	return c.JSON(http.StatusOK, ws)
}

func (h *WorkspaceHandler) ListMembers(c echo.Context) error {
	id, _ := uuid.Parse(c.Param("id"))
	members, err := h.uc.ListMembers(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusOK, members)
}

func (h *WorkspaceHandler) AddMember(c echo.Context) error {
	wsID, _ := uuid.Parse(c.Param("id"))
	var req struct {
		UserID uuid.UUID `json:"user_id"`
	}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := h.uc.AddMember(c.Request().Context(), wsID, req.UserID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.JSON(http.StatusCreated, map[string]string{"status": "added"})
}

func (h *WorkspaceHandler) RemoveMember(c echo.Context) error {
	wsID, _ := uuid.Parse(c.Param("id"))
	userID, _ := uuid.Parse(c.Param("uid"))
	if err := h.uc.RemoveMember(c.Request().Context(), wsID, userID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}
	return c.NoContent(http.StatusNoContent)
}
