-- =============================================
-- SmartBiz Enterprise Suite — Full Schema v1
-- Run in Supabase SQL Editor (or psql)
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Organization ─────────────────────────────────────────────────────────────

CREATE TABLE organization (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  logo_url                TEXT,
  website                 TEXT,
  industry                TEXT,
  currency                CHAR(3) NOT NULL DEFAULT 'USD',
  timezone                TEXT NOT NULL DEFAULT 'UTC',
  parent_organization_id  UUID REFERENCES organization(id) ON DELETE SET NULL,
  plan                    TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- ── Branch ───────────────────────────────────────────────────────────────────

CREATE TABLE branch (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  code              TEXT NOT NULL,
  address           TEXT,
  city              TEXT,
  country           TEXT,
  is_headquarters   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ── Department ───────────────────────────────────────────────────────────────

CREATE TABLE department (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branch(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  code              TEXT,
  head_employee_id  UUID, -- FK added after employee table
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ── Team ─────────────────────────────────────────────────────────────────────

CREATE TABLE team (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES department(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ── Organization Modules ──────────────────────────────────────────────────────

CREATE TABLE organization_module (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  module_key        TEXT NOT NULL,
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, module_key)
);

-- ── App Role ──────────────────────────────────────────────────────────────────

CREATE TABLE app_role (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  permissions       JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

-- ── User Organization Membership ──────────────────────────────────────────────

CREATE TABLE user_organization (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role              TEXT NOT NULL DEFAULT 'member',
  branch_id         UUID REFERENCES branch(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);

-- ── Employee ──────────────────────────────────────────────────────────────────

CREATE TABLE employee (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id       TEXT NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  avatar_url        TEXT,
  department_id     UUID REFERENCES department(id) ON DELETE SET NULL,
  branch_id         UUID REFERENCES branch(id) ON DELETE SET NULL,
  position          TEXT,
  employment_type   TEXT NOT NULL DEFAULT 'full-time' CHECK (employment_type IN ('full-time', 'part-time', 'contract', 'intern')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on-leave', 'inactive', 'terminated')),
  hire_date         DATE,
  salary            NUMERIC(15, 2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),
  deleted_by        UUID REFERENCES auth.users(id),
  UNIQUE (organization_id, employee_id)
);

ALTER TABLE department ADD CONSTRAINT fk_dept_head FOREIGN KEY (head_employee_id) REFERENCES employee(id) ON DELETE SET NULL;

-- ── Product Category ──────────────────────────────────────────────────────────

CREATE TABLE product_category (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  code              TEXT,
  parent_id         UUID REFERENCES product_category(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ── Product ───────────────────────────────────────────────────────────────────

CREATE TABLE product (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  sku               TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  category_id       UUID REFERENCES product_category(id) ON DELETE SET NULL,
  unit_price        NUMERIC(15, 4) NOT NULL DEFAULT 0,
  cost_price        NUMERIC(15, 4),
  image_url         TEXT,
  barcode           TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  reorder_level     INTEGER NOT NULL DEFAULT 10,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),
  deleted_by        UUID REFERENCES auth.users(id),
  UNIQUE (organization_id, sku)
);

-- ── Warehouse ─────────────────────────────────────────────────────────────────

CREATE TABLE warehouse (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branch(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  code              TEXT,
  address           TEXT,
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- ── Stock Level ───────────────────────────────────────────────────────────────

CREATE TABLE stock_level (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  warehouse_id        UUID NOT NULL REFERENCES warehouse(id) ON DELETE CASCADE,
  quantity            NUMERIC(15, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity   NUMERIC(15, 4) NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, warehouse_id)
);

-- ── Customer ──────────────────────────────────────────────────────────────────

CREATE TABLE customer (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  address               TEXT,
  city                  TEXT,
  country               TEXT,
  segment               TEXT CHECK (segment IN ('retail', 'wholesale', 'corporate', 'vip')),
  credit_limit          NUMERIC(15, 2) NOT NULL DEFAULT 0,
  outstanding_balance   NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_spend           NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,
  created_by            UUID REFERENCES auth.users(id)
);

-- ── Sale ──────────────────────────────────────────────────────────────────────

CREATE TABLE sale (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  branch_id         UUID REFERENCES branch(id) ON DELETE SET NULL,
  reference_number  TEXT NOT NULL,
  customer_id       UUID REFERENCES customer(id) ON DELETE SET NULL,
  cashier_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subtotal          NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(15, 4) NOT NULL DEFAULT 0,
  payment_method    TEXT CHECK (payment_method IN ('cash', 'card', 'mobile', 'credit')),
  payment_status    TEXT NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid', 'pending', 'partial', 'cancelled')),
  notes             TEXT,
  sale_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id),
  UNIQUE (organization_id, reference_number)
);

-- ── Sale Item ─────────────────────────────────────────────────────────────────

CREATE TABLE sale_item (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  sale_id           UUID NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
  quantity          NUMERIC(15, 4) NOT NULL DEFAULT 1,
  unit_price        NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(15, 4) NOT NULL DEFAULT 0,
  line_total        NUMERIC(15, 4) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Invoice ───────────────────────────────────────────────────────────────────

CREATE TABLE invoice (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  invoice_number    TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
  sale_id           UUID REFERENCES sale(id) ON DELETE SET NULL,
  branch_id         UUID REFERENCES branch(id) ON DELETE SET NULL,
  issue_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE NOT NULL,
  subtotal          NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(15, 4) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(15, 4) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'overdue', 'cancelled')),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),
  UNIQUE (organization_id, invoice_number)
);

-- ── Invoice Payment ───────────────────────────────────────────────────────────

CREATE TABLE invoice_payment (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  invoice_id        UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  amount            NUMERIC(15, 4) NOT NULL DEFAULT 0,
  payment_method    TEXT NOT NULL DEFAULT 'cash',
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  reference         TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id)
);

-- ── Leave Type ────────────────────────────────────────────────────────────────

CREATE TABLE leave_type (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  days_allowed      INTEGER NOT NULL DEFAULT 0,
  is_paid           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Leave Request ─────────────────────────────────────────────────────────────

CREATE TABLE leave_request (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  leave_type_id     UUID NOT NULL REFERENCES leave_type(id) ON DELETE RESTRICT,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  days_requested    INTEGER NOT NULL DEFAULT 1,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by       UUID REFERENCES auth.users(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id)
);

-- ── Notification ──────────────────────────────────────────────────────────────

CREATE TABLE notification (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  type              TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  action_url        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Approval Request ──────────────────────────────────────────────────────────

CREATE TABLE approval_request (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  module            TEXT NOT NULL,
  reference_type    TEXT NOT NULL,
  reference_id      UUID NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  requester_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  approver_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  comment           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at        TIMESTAMPTZ
);

-- ── Stock Decrement RPC ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id UUID,
  p_organization_id UUID,
  p_quantity NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE stock_level
  SET quantity = GREATEST(0, quantity - p_quantity),
      updated_at = NOW()
  WHERE product_id = p_product_id
    AND organization_id = p_organization_id;
END;
$$;

-- ── Updated At triggers ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organization','branch','department','organization_module','user_organization','employee','product','warehouse','customer','sale','invoice','leave_request','approval_request']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_update_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
  END LOOP;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_employee_org ON employee(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_org ON product(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sale_org_date ON sale(organization_id, sale_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoice_org_status ON invoice(organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_customer_org ON customer(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_notification_user ON notification(user_id, is_read);
CREATE INDEX idx_approval_approver ON approval_request(approver_id, status);
