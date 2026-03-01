FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /chat-service ./cmd/server/

FROM alpine:3.19 AS final
WORKDIR /app
COPY --from=build /chat-service .
EXPOSE 8080
ENTRYPOINT ["./chat-service"]
