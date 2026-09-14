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
