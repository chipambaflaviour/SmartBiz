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
