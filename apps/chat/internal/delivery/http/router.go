package http

import (
	"github.com/labstack/echo/v4"
	wshandler "github.com/trainheartnet/mvp-chat/internal/delivery/ws"
)

func RegisterRoutes(e *echo.Echo, wh *WorkspaceHandler, mh *MessageHandler, wsHandler *wshandler.WSHandler) {
	// WebSocket route at top level
	e.GET("/ws", wsHandler.HandleWS)

	api := e.Group("/api")
	ws := api.Group("/workspaces")

	ws.GET("/:id", wh.GetWorkspace)
	ws.GET("/by-bu/:buId", wh.GetWorkspaceByBuID)
	ws.GET("/:id/members", wh.ListMembers)
	ws.POST("/:id/members", wh.AddMember)
	ws.DELETE("/:id/members/:uid", wh.RemoveMember)

	// Message routes
	ws.GET("/by-bu/:buId/messages", mh.GetHistory)
}
