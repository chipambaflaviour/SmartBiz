-- Enforce the SmartBiz hierarchy at the database boundary:
-- Platform Backoffice -> client organization -> branches.
-- A client owner/admin may manage branches but cannot create another tenant.

DROP POLICY IF EXISTS "Authenticated users can create organizations"
  ON public.organization;
DROP POLICY IF EXISTS "Users can create organizations"
  ON public.organization;
DROP POLICY IF EXISTS "Members can create organizations"
  ON public.organization;

DROP POLICY IF EXISTS "Platform administrators create organizations"
  ON public.organization;
CREATE POLICY "Platform administrators create organizations"
ON public.organization
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin());

-- Remove the legacy self-enrolment path. Organization membership must be
-- assigned by platform staff or an authorized organization administrator.
DROP POLICY IF EXISTS "Users can join orgs"
  ON public.user_organization;

-- Preserve the hardened membership policy when the RevPOS hierarchy script has
-- not yet been applied to an older environment.
DROP POLICY IF EXISTS "Owners can manage memberships"
  ON public.user_organization;
DROP POLICY IF EXISTS "SmartBiz membership administrators"
  ON public.user_organization;
CREATE POLICY "SmartBiz membership administrators"
ON public.user_organization
FOR ALL TO authenticated
USING (
  public.is_platform_admin()
  OR public.user_has_role(organization_id, 'owner')
  OR (
    public.user_has_role(organization_id, 'admin')
    AND role NOT IN ('owner', 'admin')
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR public.user_has_role(organization_id, 'owner')
  OR (
    public.user_has_role(organization_id, 'admin')
    AND role NOT IN ('owner', 'admin')
    AND user_id <> auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';
