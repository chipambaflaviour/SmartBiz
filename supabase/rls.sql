-- =============================================
-- SmartBiz Enterprise Suite — Row Level Security
-- Run AFTER schema.sql
-- =============================================

-- Enable RLS on all business tables
ALTER TABLE organization          ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch                ENABLE ROW LEVEL SECURITY;
ALTER TABLE department            ENABLE ROW LEVEL SECURITY;
ALTER TABLE team                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_module   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_role              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organization     ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee              ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_category      ENABLE ROW LEVEL SECURITY;
ALTER TABLE product               ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse             ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_level           ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer              ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_item             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice               ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_payment       ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_type            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification          ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_request      ENABLE ROW LEVEL SECURITY;

-- ── Helper: get active org IDs for current user ────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_organization_ids()
RETURNS UUID[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT ARRAY(
    SELECT organization_id FROM user_organization
    WHERE user_id = auth.uid() AND is_active = TRUE
  );
$$;

-- ── Helper: check if user belongs to a specific org ────────────────────────────
CREATE OR REPLACE FUNCTION user_in_org(org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_organization
    WHERE user_id = auth.uid() AND organization_id = org_id AND is_active = TRUE
  );
$$;

-- ── Helper: check if user has a role in an org ────────────────────────────────
CREATE OR REPLACE FUNCTION user_has_role(org_id UUID, role_name TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_organization
    WHERE user_id = auth.uid() AND organization_id = org_id AND role = role_name AND is_active = TRUE
  );
$$;

-- ── Organization ─────────────────────────────────────────────────────────────

CREATE POLICY "Users can view their organizations"
  ON organization FOR SELECT
  USING (user_in_org(id));

CREATE POLICY "Owners can update their organizations"
  ON organization FOR UPDATE
  USING (user_has_role(id, 'owner'));

CREATE POLICY "Authenticated users can create organizations"
  ON organization FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Branch ───────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view branches in their org"
  ON branch FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Admins can manage branches"
  ON branch FOR ALL
  USING (user_has_role(organization_id, 'owner') OR user_has_role(organization_id, 'admin'));

-- ── Department ───────────────────────────────────────────────────────────────

CREATE POLICY "Users can view departments in their org"
  ON department FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Admins can manage departments"
  ON department FOR ALL
  USING (user_has_role(organization_id, 'owner') OR user_has_role(organization_id, 'admin'));

-- ── Team ─────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view teams in their org"
  ON team FOR SELECT
  USING (user_in_org(organization_id));

-- ── Organization Module ───────────────────────────────────────────────────────

CREATE POLICY "Users can view modules in their org"
  ON organization_module FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Owners can manage modules"
  ON organization_module FOR ALL
  USING (user_has_role(organization_id, 'owner') OR user_has_role(organization_id, 'admin'));

-- ── User Organization ─────────────────────────────────────────────────────────

CREATE POLICY "Users can view own memberships"
  ON user_organization FOR SELECT
  USING (user_id = auth.uid() OR user_in_org(organization_id));

CREATE POLICY "Owners can manage memberships"
  ON user_organization FOR ALL
  USING (user_has_role(organization_id, 'owner') OR user_has_role(organization_id, 'admin'));

CREATE POLICY "Users can join orgs"
  ON user_organization FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── Employee ──────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view employees in their org"
  ON employee FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "HR managers can manage employees"
  ON employee FOR ALL
  USING (user_in_org(organization_id));

-- ── Product Category ──────────────────────────────────────────────────────────

CREATE POLICY "Users can view product categories"
  ON product_category FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can manage product categories"
  ON product_category FOR ALL
  USING (user_in_org(organization_id));

-- ── Product ───────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view products"
  ON product FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can manage products"
  ON product FOR ALL
  USING (user_in_org(organization_id));

-- ── Warehouse ─────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view warehouses"
  ON warehouse FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Admins can manage warehouses"
  ON warehouse FOR ALL
  USING (user_in_org(organization_id));

-- ── Stock Level ───────────────────────────────────────────────────────────────

CREATE POLICY "Users can view stock levels"
  ON stock_level FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Users can manage stock levels"
  ON stock_level FOR ALL
  USING (user_in_org(organization_id));

-- ── Customer ──────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view customers"
  ON customer FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can manage customers"
  ON customer FOR ALL
  USING (user_in_org(organization_id));

-- ── Sale ──────────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view sales"
  ON sale FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can create sales"
  ON sale FOR INSERT
  WITH CHECK (user_in_org(organization_id));

CREATE POLICY "Managers can update sales"
  ON sale FOR UPDATE
  USING (user_in_org(organization_id));

-- ── Sale Item ─────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view sale items"
  ON sale_item FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Users can create sale items"
  ON sale_item FOR INSERT
  WITH CHECK (user_in_org(organization_id));

-- ── Invoice ───────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view invoices"
  ON invoice FOR SELECT
  USING (user_in_org(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can manage invoices"
  ON invoice FOR ALL
  USING (user_in_org(organization_id));

-- ── Invoice Payment ───────────────────────────────────────────────────────────

CREATE POLICY "Users can view payments"
  ON invoice_payment FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Users can create payments"
  ON invoice_payment FOR INSERT
  WITH CHECK (user_in_org(organization_id));

-- ── Leave Type ────────────────────────────────────────────────────────────────

CREATE POLICY "Users can view leave types"
  ON leave_type FOR SELECT
  USING (user_in_org(organization_id));

-- ── Leave Request ─────────────────────────────────────────────────────────────

CREATE POLICY "Users can view leave requests in their org"
  ON leave_request FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Users can create leave requests"
  ON leave_request FOR INSERT
  WITH CHECK (user_in_org(organization_id));

CREATE POLICY "Managers can update leave requests"
  ON leave_request FOR UPDATE
  USING (user_in_org(organization_id));

-- ── Notification ──────────────────────────────────────────────────────────────

CREATE POLICY "Users can view own notifications"
  ON notification FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notification FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "System can create notifications"
  ON notification FOR INSERT
  WITH CHECK (user_in_org(organization_id));

-- ── Approval Request ──────────────────────────────────────────────────────────

CREATE POLICY "Users can view approvals in their org"
  ON approval_request FOR SELECT
  USING (user_in_org(organization_id));

CREATE POLICY "Users can create approval requests"
  ON approval_request FOR INSERT
  WITH CHECK (user_in_org(organization_id));

CREATE POLICY "Approvers can update approvals"
  ON approval_request FOR UPDATE
  USING (approver_id = auth.uid() OR user_in_org(organization_id));
