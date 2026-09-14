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
