-- SmartBiz: assign an existing registered user to an organization.
-- Safe to rerun.

CREATE OR REPLACE FUNCTION public.platform_assign_organization_user(
  p_organization_id UUID,
  p_email TEXT,
  p_role TEXT DEFAULT 'owner'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  target_user_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required';
  END IF;

  IF p_role NOT IN ('owner','admin','manager','member','auditor') THEN
    RAISE EXCEPTION 'Invalid organization role';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email));

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No SmartBiz user exists for %. Ask this user to register first.', p_email;
  END IF;

  INSERT INTO public.user_organization (user_id, organization_id, role, is_active)
  VALUES (target_user_id, p_organization_id, p_role, TRUE)
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, updated_at = NOW();

  INSERT INTO public.audit_log (organization_id, user_id, module, action, entity_type, entity_id, new_data)
  VALUES (p_organization_id, auth.uid(), 'platform', 'organization.user_assigned', 'user', target_user_id,
    jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));

  RETURN target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_assign_organization_user(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_assign_organization_user(UUID,TEXT,TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
