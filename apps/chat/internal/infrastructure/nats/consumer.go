package nats

import (
	"context"
	"encoding/json"
	"log"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type BuCreatedEvent struct {
	BuID        uuid.UUID `json:"bu_id"`
	BuName      string    `json:"bu_name"`
	OwnerUserID uuid.UUID `json:"owner_user_id"`
	CompanyID   uuid.UUID `json:"company_id"`
}

func StartConsumer(ctx context.Context, natsURL string, uc usecase.WorkspaceUseCase) error {
	nc, err := nats.Connect(natsURL)
	if err != nil {
		return err
	}

	js, err := jetstream.New(nc)
	if err != nil {
		return err
	}

	// Ensure stream exists (idempotent)
	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:      "PLATFORM_EVENTS",
		Subjects:  []string{"bu.*"},
		Retention: jetstream.WorkQueuePolicy,
	})
	if err != nil {
		return err
	}

	cons, err := js.CreateOrUpdateConsumer(ctx, "PLATFORM_EVENTS", jetstream.ConsumerConfig{
		Durable:   "chat-service",
		AckPolicy: jetstream.AckExplicitPolicy,
	})
	if err != nil {
		return err
	}

	_, err = cons.Consume(func(msg jetstream.Msg) {
		var event BuCreatedEvent
		if err := json.Unmarshal(msg.Data(), &event); err != nil {
			log.Printf("invalid message: %v", err)
			msg.Nak()
			return
		}
		if err := uc.Provision(ctx, event.BuID, event.BuName, event.OwnerUserID); err != nil {
			log.Printf("provision failed: %v", err)
			msg.Nak()
			return
		}
		msg.Ack()
		log.Printf("provisioned workspace for BU %s", event.BuID)
	})

	return err
}
