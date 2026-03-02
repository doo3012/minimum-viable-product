package http

import "github.com/labstack/echo/v4"

func RegisterRoutes(e *echo.Echo, wh *WorkspaceHandler) {
	api := e.Group("/api")
	ws := api.Group("/workspaces")
	ws.GET("/by-bu/:buId", wh.GetWorkspaceByBuID)
	ws.GET("/:id", wh.GetWorkspace)
	ws.GET("/:id/members", wh.ListMembers)
	ws.POST("/:id/members", wh.AddMember)
	ws.DELETE("/:id/members/:uid", wh.RemoveMember)
}
