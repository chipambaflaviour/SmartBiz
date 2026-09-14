-- SmartBiz: all pending fixes in one script. Safe to rerun.

-- ==========================================================================
-- default_warehouse.sql
-- ==========================================================================
-- SmartBiz: guarantee every organization has a default warehouse.
-- Stock levels are stored per warehouse, so an organization without one can
-- never hold stock (products show "out of stock" no matter what is entered).
-- Safe to rerun.

-- 1. Backfill: create a "Main Warehouse" for every organization that has none,
--    attached to its headquarters branch where one exists.
INSERT INTO public.warehouse (organization_id, branch_id, name, code, is_default)
SELECT o.id,
       (SELECT b.id FROM public.branch b
         WHERE b.organization_id = o.id AND b.deleted_at IS NULL
         ORDER BY b.is_headquarters DESC, b.created_at ASC LIMIT 1),
       'Main Warehouse', 'MAIN', TRUE
FROM public.organization o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.warehouse w
    WHERE w.organization_id = o.id AND w.deleted_at IS NULL
  );

-- 2. Going forward: whenever a branch is created for an organization that has
--    no warehouse yet (this happens inside platform_create_organization and when
--    an owner adds their first branch), create the default warehouse automatically.
CREATE OR REPLACE FUNCTION public.ensure_default_warehouse()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouse
    WHERE organization_id = NEW.organization_id AND deleted_at IS NULL
  ) THEN
    INSERT INTO public.warehouse (organization_id, branch_id, name, code, is_default)
    VALUES (NEW.organization_id, NEW.id, 'Main Warehouse', 'MAIN', TRUE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_ensure_default_warehouse ON public.branch;
CREATE TRIGGER trg_branch_ensure_default_warehouse
AFTER INSERT ON public.branch
FOR EACH ROW EXECUTE FUNCTION public.ensure_default_warehouse();

-- 3. Let any active member of the organization create a warehouse when none
--    exists yet (the product form does this as a fallback), while keeping
--    edits/deletes restricted to owners and admins.
DROP POLICY IF EXISTS "Members can create first warehouse" ON public.warehouse;
CREATE POLICY "Members can create first warehouse"
  ON public.warehouse FOR INSERT TO authenticated
  WITH CHECK (
    public.user_in_org(organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.warehouse w
      WHERE w.organization_id = warehouse.organization_id AND w.deleted_at IS NULL
    )
  );

-- 4. Atomic "set stock on hand" used by the product editor. Upserts the
--    stock_level row and records the change in the audit log.
CREATE OR REPLACE FUNCTION public.set_stock_level(
  p_organization_id UUID,
  p_product_id UUID,
  p_warehouse_id UUID,
  p_quantity NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  previous NUMERIC;
BEGIN
  IF NOT public.user_in_org(p_organization_id) THEN
    RAISE EXCEPTION 'Organization membership required';
  END IF;
  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product WHERE id = p_product_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Product not found in this organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouse WHERE id = p_warehouse_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Warehouse not found in this organization';
  END IF;

  SELECT quantity INTO previous FROM public.stock_level
  WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;

  INSERT INTO public.stock_level (organization_id, product_id, warehouse_id, quantity)
  VALUES (p_organization_id, p_product_id, p_warehouse_id, p_quantity)
  ON CONFLICT (product_id, warehouse_id)
  DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

  IF previous IS DISTINCT FROM p_quantity THEN
    INSERT INTO public.audit_log (organization_id, user_id, module, action, entity_type, entity_id, old_data, new_data)
    VALUES (p_organization_id, auth.uid(), 'inventory', 'stock_level.set', 'product', p_product_id,
      jsonb_build_object('warehouse_id', p_warehouse_id, 'quantity', previous),
      jsonb_build_object('warehouse_id', p_warehouse_id, 'quantity', p_quantity));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_stock_level(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_stock_level(UUID, UUID, UUID, NUMERIC) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- core_modules_fix.sql
-- ==========================================================================
-- SmartBiz: make sure every organization keeps its core modules
-- (dashboard, approvals, subscription). The Control Center module picker used
-- to delete them, which made "Give this employee system access" fail with
-- "One or more modules are not purchased by this organization".
-- Safe to rerun.

-- 1. Backfill core modules for every organization that is missing them.
INSERT INTO public.organization_module (organization_id, module_key, is_enabled)
SELECT o.id, m.key, TRUE
FROM public.organization o
CROSS JOIN public.module_catalog m
WHERE m.is_core = TRUE
  AND o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_module om
    WHERE om.organization_id = o.id AND om.module_key = m.key
  );

UPDATE public.organization_module om
SET is_enabled = TRUE
FROM public.module_catalog m
WHERE om.module_key = m.key AND m.is_core = TRUE AND om.is_enabled = FALSE;

-- 2. Treat core modules as always available when assigning employee access,
--    so a stray missing row can never block an invitation again.
CREATE OR REPLACE FUNCTION public.assign_user_module_access(
  p_user_id UUID,
  p_organization_id UUID,
  p_module_keys TEXT[]
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.user_has_role(p_organization_id, 'owner')
    OR public.user_has_role(p_organization_id, 'admin')
    OR public.is_platform_admin()
  ) THEN RAISE EXCEPTION 'Organization administrator access required'; END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_module_keys, ARRAY[]::TEXT[])) requested(module_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_module purchased
      WHERE purchased.organization_id = p_organization_id
        AND purchased.module_key = requested.module_key
        AND purchased.is_enabled = TRUE
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.module_catalog core
      WHERE core.key = requested.module_key AND core.is_core = TRUE
    )
  ) THEN RAISE EXCEPTION 'One or more modules are not purchased by this organization'; END IF;

  DELETE FROM public.user_module_access
  WHERE user_id = p_user_id AND organization_id = p_organization_id;

  INSERT INTO public.user_module_access
    (user_id, organization_id, module_key, can_view, can_create, can_update, can_delete)
  SELECT p_user_id, p_organization_id, requested.module_key, TRUE, TRUE, TRUE, FALSE
  FROM unnest(COALESCE(p_module_keys, ARRAY[]::TEXT[])) requested(module_key)
  -- only rows that satisfy the user_module_access WITH CHECK policy
  WHERE EXISTS (
    SELECT 1 FROM public.organization_module purchased
    WHERE purchased.organization_id = p_organization_id
      AND purchased.module_key = requested.module_key
      AND purchased.is_enabled = TRUE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_module_access(UUID, UUID, TEXT[]) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- platform_admin_full_access.sql
-- ==========================================================================
-- SmartBiz: give platform super-administrators full CRUD access inside every
-- organization. Every tenant RLS policy is built on user_in_org() and
-- user_has_role(); making those return TRUE for platform admins grants
-- owner-level access across all modules without touching individual policies.
-- Safe to rerun.

CREATE OR REPLACE FUNCTION public.user_in_org(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organization
    WHERE user_id = auth.uid() AND organization_id = org_id AND is_active = TRUE
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_admin
    WHERE user_id = auth.uid() AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(org_id UUID, role_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organization
    WHERE user_id = auth.uid() AND organization_id = org_id AND role = role_name AND is_active = TRUE
  )
  OR EXISTS (
    SELECT 1 FROM public.platform_admin
    WHERE user_id = auth.uid() AND is_active = TRUE
  );
$$;

-- Platform admins can read every organization (needed for the org switcher and top bar).
DROP POLICY IF EXISTS "Platform admins view organizations" ON public.organization;
CREATE POLICY "Platform admins view organizations" ON public.organization
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Some tables were created with policies that use WITH CHECK on insert; make sure the
-- helper change is picked up by PostgREST immediately.
NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- protect_org_owner.sql
-- ==========================================================================
-- SmartBiz: an organization must always keep at least one active owner.
-- Prevents the owner assigned at creation from being demoted or deactivated
-- by any later flow (employee access, imports, manual edits). Safe to rerun.

CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  remaining_owners INTEGER;
BEGIN
  -- Only care when a row stops being an active owner
  IF OLD.role = 'owner' AND OLD.is_active = TRUE
     AND (NEW.role <> 'owner' OR NEW.is_active = FALSE) THEN
    SELECT COUNT(*) INTO remaining_owners
    FROM public.user_organization
    WHERE organization_id = OLD.organization_id
      AND role = 'owner' AND is_active = TRUE
      AND user_id <> OLD.user_id;
    IF remaining_owners = 0 THEN
      -- Keep them as owner instead of failing: the employee flow simply must not demote owners.
      NEW.role := 'owner';
      NEW.is_active := TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.user_organization;
CREATE TRIGGER trg_protect_last_owner
BEFORE UPDATE ON public.user_organization
FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

NOTIFY pgrst, 'reload schema';

