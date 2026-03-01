# MVP B2B Multi-Tenant SaaS Platform

## Quick Start

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (.NET) | http://localhost:5000 |
| Chat (Go) | http://localhost:8080 |
| NATS Monitor | http://localhost:8222 |
| PostgreSQL | localhost:5432 |

## Architecture

See [docs/plans/2026-03-01-mvp-saas-platform-design.md](docs/plans/2026-03-01-mvp-saas-platform-design.md)

## Key Decisions

- **Multi-tenancy:** Row-level isolation via `company_id` on all tenant tables
- **Events:** NATS JetStream (`bu.created`) for async workspace provisioning
- **Auth:** JWT in httpOnly cookie, claims include `company_id` and `role`
- **Architecture:** .NET VSA+CQRS, Go Clean Architecture, Next.js App Router BFF

## Assumptions

1. Default password returned in onboarding response (no email service)
2. Chat service is internal — no direct frontend access
3. JWT expiry: 24h, no refresh token in MVP scope
