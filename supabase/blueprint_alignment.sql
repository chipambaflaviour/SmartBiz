-- SmartBiz Blueprint Alignment v2
-- Run AFTER schema.sql and rls.sql in a new Supabase project.

-- Organization lifecycle and commercial configuration
ALTER TABLE organization ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE organization ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE organization ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE organization ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
ALTER TABLE organization DROP CONSTRAINT IF EXISTS organization_status_check;
ALTER TABLE organization ADD CONSTRAINT organization_status_check
  CHECK (status IN ('trial','active','pending_payment','suspended','expired','cancelled','archived'));

-- POS methods required by the blueprint
ALTER TABLE sale DROP CONSTRAINT IF EXISTS sale_payment_method_check;
ALTER TABLE sale ADD CONSTRAINT sale_payment_method_check
  CHECK (payment_method IN ('cash','card','bank_transfer','mobile_money','credit','split'));
ALTER TABLE sale DROP CONSTRAINT IF EXISTS sale_payment_status_check;
ALTER TABLE sale ADD CONSTRAINT sale_payment_status_check
  CHECK (payment_status IN ('paid','pending','partial','credit','cancelled','refunded'));

CREATE TABLE IF NOT EXISTS platform_admin (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'platform_admin' CHECK (role IN ('platform_admin','platform_support','platform_auditor')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS module_catalog (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  is_core BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO module_catalog (key,name,category,is_core) VALUES
 ('dashboard','Dashboard','Operate',TRUE), ('pos','Sales & POS','Operate',FALSE),
 ('inventory','Products & Inventory','Operate',FALSE), ('purchasing','Purchasing','Operate',FALSE),
 ('suppliers','Suppliers','Operate',FALSE), ('crm','Customers & CRM','Operate',FALSE),
 ('hr','Employees & HR','People',FALSE), ('payroll','Payroll','People',FALSE),
 ('leave','Leave','People',FALSE), ('loans','Employee Loans','People',FALSE),
 ('finance','Finance','Finance',FALSE), ('expenses','Expenses','Finance',FALSE),
 ('accounting','Accounting','Finance',FALSE), ('assets','Assets','Finance',FALSE),
 ('reports','Reports & BI','Intelligence',FALSE), ('approvals','Approvals','Intelligence',TRUE),
 ('workflow','Automation','Intelligence',FALSE), ('ai','AI & Analytics','Intelligence',FALSE),
 ('marketplace','Marketplace','Platform',FALSE), ('security','Security Center','Platform',FALSE),
 ('audit','Audit Logs','Platform',FALSE), ('subscription','Subscription','Platform',TRUE),
 ('developer','Developer & APIs','Platform',FALSE)
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, is_core=EXCLUDED.is_core;

CREATE TABLE IF NOT EXISTS subscription_plan (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  monthly_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'ZMW',
  user_limit INTEGER,
  branch_limit INTEGER,
  child_organization_limit INTEGER,
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plan (name,code,user_limit,branch_limit,child_organization_limit) VALUES
 ('Trial','trial',3,1,0), ('Starter','starter',5,1,0),
 ('Professional','professional',25,5,2), ('Enterprise','enterprise',NULL,NULL,NULL),
 ('Custom','custom',NULL,NULL,NULL)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_subscription (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plan(id),
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','pending_payment','expired','suspended','cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'ZMW',
  payment_reference TEXT,
  payment_recorded_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_subscription_per_org
  ON organization_subscription(organization_id) WHERE status IN ('trial','active','pending_payment','suspended');

ALTER TABLE organization_module ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE organization_module ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE organization_module ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);

CREATE TABLE IF NOT EXISTS sale_payment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sale(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customer(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','card','bank_transfer','mobile_money','credit')),
  provider TEXT,
  reference TEXT,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_credit_transaction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
  sale_id UUID REFERENCES sale(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('credit_sale','payment','adjustment','credit_note')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  reference TEXT,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organization(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admin WHERE user_id=auth.uid() AND is_active=TRUE);
$$;

CREATE OR REPLACE FUNCTION organization_can_transact(org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization
    WHERE id=org_id AND deleted_at IS NULL AND status IN ('trial','active')
      AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
  );
$$;

ALTER TABLE platform_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read module catalog" ON module_catalog FOR SELECT TO authenticated USING (is_active);
CREATE POLICY "Authenticated users read plans" ON subscription_plan FOR SELECT TO authenticated USING (is_active);
CREATE POLICY "Platform admins manage catalog" ON module_catalog FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins manage plans" ON subscription_plan FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins manage organizations" ON organization FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins manage subscriptions" ON organization_subscription FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Members read own subscription" ON organization_subscription FOR SELECT TO authenticated USING (user_in_org(organization_id));
CREATE POLICY "Members read sale payments" ON sale_payment FOR SELECT TO authenticated USING (user_in_org(organization_id));
CREATE POLICY "Active members create sale payments" ON sale_payment FOR INSERT TO authenticated WITH CHECK (user_in_org(organization_id) AND organization_can_transact(organization_id));
CREATE POLICY "Members read customer credit" ON customer_credit_transaction FOR SELECT TO authenticated USING (user_in_org(organization_id));
CREATE POLICY "Active members create customer credit" ON customer_credit_transaction FOR INSERT TO authenticated WITH CHECK (user_in_org(organization_id) AND organization_can_transact(organization_id));
CREATE POLICY "Organization admins read audit" ON audit_log FOR SELECT TO authenticated USING (user_has_role(organization_id,'owner') OR user_has_role(organization_id,'admin') OR is_platform_admin());
CREATE POLICY "Authenticated audit inserts" ON audit_log FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());

CREATE INDEX IF NOT EXISTS idx_subscription_org ON organization_subscription(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_sale_payment_org_sale ON sale_payment(organization_id,sale_id);
CREATE INDEX IF NOT EXISTS idx_credit_customer_date ON customer_credit_transaction(organization_id,customer_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_date ON audit_log(organization_id,created_at DESC);
