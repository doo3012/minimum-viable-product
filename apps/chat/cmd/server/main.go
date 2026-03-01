package main

import (
	"context"
	"log"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	deliveryhttp "github.com/trainheartnet/mvp-chat/internal/delivery/http"
	natsinf "github.com/trainheartnet/mvp-chat/internal/infrastructure/nats"
	"github.com/trainheartnet/mvp-chat/internal/infrastructure/postgres"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

func main() {
	ctx := context.Background()

	// Connect to PostgreSQL
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@postgres:5432/mvp"
	}
	pool, err := postgres.NewPool(ctx, dsn)
	if err != nil {
		log.Fatalf("failed to connect to postgres: %v", err)
	}
	defer pool.Close()

	// Wire repos and use case
	wsRepo := postgres.NewWorkspaceRepo(pool)
	memRepo := postgres.NewMemberRepo(pool)
	wsUseCase := usecase.NewWorkspaceUseCase(wsRepo, memRepo)

	// Start NATS consumer in background
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://nats:4222"
	}
	go func() {
		if err := natsinf.StartConsumer(ctx, natsURL, wsUseCase); err != nil {
			log.Fatalf("NATS consumer failed: %v", err)
		}
	}()

	// Start HTTP server
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	handler := deliveryhttp.NewWorkspaceHandler(wsUseCase)
	deliveryhttp.RegisterRoutes(e, handler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Fatal(e.Start(":" + port))
}
