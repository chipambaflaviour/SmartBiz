-- SmartBiz tenant employee access and branch administration.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.user_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id, module_key)
);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own module access" ON public.user_module_access;
CREATE POLICY "Members read own module access" ON public.user_module_access
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.user_has_role(organization_id, 'owner')
  OR public.user_has_role(organization_id, 'admin')
  OR public.is_platform_admin()
);

DROP POLICY IF EXISTS "Organization admins manage module access" ON public.user_module_access;
CREATE POLICY "Organization admins manage module access" ON public.user_module_access
FOR ALL TO authenticated
USING (
  public.user_has_role(organization_id, 'owner')
  OR public.user_has_role(organization_id, 'admin')
  OR public.is_platform_admin()
)
WITH CHECK (
  (public.user_has_role(organization_id, 'owner')
   OR public.user_has_role(organization_id, 'admin')
   OR public.is_platform_admin())
  AND EXISTS (
    SELECT 1 FROM public.organization_module purchased
    WHERE purchased.organization_id = user_module_access.organization_id
      AND purchased.module_key = user_module_access.module_key
      AND purchased.is_enabled = TRUE
  )
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_lookup
ON public.user_module_access(user_id, organization_id, module_key);

-- Prevent tenant admins from assigning modules not purchased by the main org.
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
  ) THEN RAISE EXCEPTION 'One or more modules are not purchased by this organization'; END IF;

  DELETE FROM public.user_module_access
  WHERE user_id = p_user_id AND organization_id = p_organization_id;

  INSERT INTO public.user_module_access
    (user_id, organization_id, module_key, can_view, can_create, can_update, can_delete)
  SELECT p_user_id, p_organization_id, module_key, TRUE, TRUE, TRUE, FALSE
  FROM unnest(COALESCE(p_module_keys, ARRAY[]::TEXT[])) module_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_module_access(UUID, UUID, TEXT[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
