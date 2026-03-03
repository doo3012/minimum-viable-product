-- infra/postgres/init.sql

CREATE SCHEMA IF NOT EXISTS main;
CREATE SCHEMA IF NOT EXISTS chat;

-- ============================================================
-- SCHEMA: main (owned by .NET API)
-- ============================================================

CREATE TABLE IF NOT EXISTS main.companies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  address        TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.business_units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES main.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES main.companies(id) ON DELETE CASCADE,
  username             TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('Owner','Admin','Staff')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.staff_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES main.companies(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES main.users(id),
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.staff_bu (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES main.staff_profiles(id) ON DELETE CASCADE,
  bu_id      UUID NOT NULL REFERENCES main.business_units(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);

CREATE TABLE IF NOT EXISTS main.chat_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES main.staff_profiles(id) ON DELETE CASCADE,
  bu_id      UUID NOT NULL REFERENCES main.business_units(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);

-- ============================================================
-- SCHEMA: chat (owned by Go chat service)
-- ============================================================

CREATE TABLE IF NOT EXISTS chat.workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bu_id      UUID NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
