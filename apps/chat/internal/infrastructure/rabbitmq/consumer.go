package rabbitmq

import (
	"context"
	"encoding/json"
	"log"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type BuCreatedEvent struct {
	BuId        uuid.UUID `json:"buId"`
	BuName      string    `json:"buName"`
	OwnerUserId uuid.UUID `json:"ownerUserId"`
	CompanyId   uuid.UUID `json:"companyId"`
}

// MassTransitEnvelope represents the MassTransit message envelope format.
type MassTransitEnvelope struct {
	Message json.RawMessage `json:"message"`
}

func StartConsumer(url string, uc usecase.WorkspaceUseCase) {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatalf("rabbitmq: failed to connect: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("rabbitmq: failed to open channel: %v", err)
	}

	// Declare exchange matching MassTransit convention
	exchangeName := "Api.Infrastructure.Messaging.Events:BusinessUnitCreated"
	err = ch.ExchangeDeclare(exchangeName, "fanout", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to declare exchange: %v", err)
	}

	q, err := ch.QueueDeclare("chat-service-bu-created", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to declare queue: %v", err)
	}

	err = ch.QueueBind(q.Name, "", exchangeName, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to bind queue: %v", err)
	}

	msgs, err := ch.Consume(q.Name, "chat-service", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to consume: %v", err)
	}

	log.Println("rabbitmq: consumer started, waiting for messages...")

	go func() {
		for d := range msgs {
			var envelope MassTransitEnvelope
			if err := json.Unmarshal(d.Body, &envelope); err != nil {
				log.Printf("rabbitmq: unmarshal envelope error: %v", err)
				d.Nack(false, false)
				continue
			}

			var evt BuCreatedEvent
			if err := json.Unmarshal(envelope.Message, &evt); err != nil {
				log.Printf("rabbitmq: unmarshal event error: %v", err)
				d.Nack(false, false)
				continue
			}

			log.Printf("rabbitmq: received BuCreated event: bu_id=%s, bu_name=%s", evt.BuId, evt.BuName)

			if err := uc.Provision(context.Background(), evt.BuId, evt.BuName, evt.OwnerUserId); err != nil {
				log.Printf("rabbitmq: provision error: %v", err)
				d.Nack(false, true) // requeue
				continue
			}

			d.Ack(false)
			log.Printf("rabbitmq: provisioned workspace for BU %s", evt.BuId)
		}
	}()
}
