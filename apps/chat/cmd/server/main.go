package main

import (
	"context"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	deliveryhttp "github.com/trainheartnet/mvp-chat/internal/delivery/http"
	"github.com/trainheartnet/mvp-chat/internal/infrastructure/postgres"
	"github.com/trainheartnet/mvp-chat/internal/infrastructure/rabbitmq"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

func main() {
	// Attempt to load .env.local if it exists
	_ = godotenv.Load(".env.local")

	ctx := context.Background()

	// Connect to PostgreSQL
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgres@postgres:5431/mvp"
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

	// Start RabbitMQ consumer in background
	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	if rabbitmqURL == "" {
		rabbitmqURL = "amqp://guest:guest@rabbitmq:5672/"
	}
	rabbitmq.StartConsumer(rabbitmqURL, wsUseCase)

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
