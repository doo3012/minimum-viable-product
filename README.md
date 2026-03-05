# MVP B2B Multi-Tenant SaaS Platform

## Quick Start

```bash
docker-compose up --build
```

| Service | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (.NET) | http://localhost:5001 |
| API Document (Scalar) | http://localhost:5001/scalar/v1 |
| Chat (Go) | http://localhost:8080 |
| RabbitMQ Mgmt | http://localhost:15672 |
| PostgreSQL | localhost:5431 |

## Architecture

See [system-design.md](system-design.md)

## Key Decisions

- **Multi-tenancy:** Row-level isolation via `company_id` on all tenant tables
- **Events:** RabbitMQ for async messaging (e.g. `bu.created` workspace provisioning)
- **Auth:** JWT in httpOnly cookie, claims include `company_id` and `role`
- **Architecture:** .NET VSA+CQRS, Go Clean Architecture, Next.js App Router BFF

## Assumptions

1. Default password returned in onboarding response (no email service)
2. Chat service is internal — no direct frontend access
3. JWT expiry: 24h, no refresh token in MVP scope
