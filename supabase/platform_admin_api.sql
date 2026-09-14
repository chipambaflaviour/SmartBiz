-- SmartBiz Platform Admin API v1
-- Run once in Supabase SQL Editor after blueprint_alignment.sql.

CREATE OR REPLACE FUNCTION platform_create_organization(
  p_name TEXT,
  p_plan_code TEXT,
  p_module_keys TEXT[],
  p_industry TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  selected_plan_id UUID;
  generated_slug TEXT;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator access required';
  END IF;
  IF length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  SELECT id INTO selected_plan_id FROM subscription_plan WHERE code=p_plan_code AND is_active=TRUE;
  IF selected_plan_id IS NULL THEN RAISE EXCEPTION 'Unknown subscription plan: %', p_plan_code; END IF;

  generated_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text,1,6);
  INSERT INTO organization (name,slug,industry,currency,timezone,plan,status,subscription_expires_at)
  VALUES (trim(p_name),generated_slug,p_industry,'ZMW','Africa/Lusaka',
    CASE WHEN p_plan_code='professional' THEN 'pro' WHEN p_plan_code IN ('starter','enterprise') THEN p_plan_code ELSE 'enterprise' END,
    'active', NOW()+INTERVAL '30 days')
  RETURNING id INTO new_org_id;

  INSERT INTO branch (organization_id,name,code,is_headquarters,country)
  VALUES (new_org_id,'Main Branch','HQ',TRUE,'Zambia');

  INSERT INTO organization_subscription (organization_id,plan_id,status,starts_at,expires_at,created_by)
  VALUES (new_org_id,selected_plan_id,'active',NOW(),NOW()+INTERVAL '30 days',auth.uid());

  INSERT INTO organization_module (organization_id,module_key,is_enabled,assigned_by)
  SELECT new_org_id,key,TRUE,auth.uid() FROM module_catalog
  WHERE key = ANY(p_module_keys) OR is_core=TRUE;

  INSERT INTO audit_log (organization_id,user_id,module,action,entity_type,entity_id,new_data)
  VALUES (new_org_id,auth.uid(),'platform','organization.created','organization',new_org_id,jsonb_build_object('name',p_name,'plan',p_plan_code,'modules',p_module_keys));
  RETURN new_org_id;
END;
$$;

REVOKE ALL ON FUNCTION platform_create_organization(TEXT,TEXT,TEXT[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_create_organization(TEXT,TEXT,TEXT[],TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION platform_assign_organization_user(
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
  SELECT id INTO target_user_id FROM auth.users WHERE lower(email)=lower(trim(p_email));
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No SmartBiz account exists for %. Ask this user to register first.', p_email;
  END IF;
  INSERT INTO public.user_organization (user_id,organization_id,role,is_active)
  VALUES (target_user_id,p_organization_id,p_role,TRUE)
  ON CONFLICT (user_id,organization_id)
  DO UPDATE SET role=EXCLUDED.role,is_active=TRUE,updated_at=NOW();
  INSERT INTO public.audit_log (organization_id,user_id,module,action,entity_type,entity_id,new_data)
  VALUES (p_organization_id,auth.uid(),'platform','organization.user_assigned','user',target_user_id,jsonb_build_object('email',p_email,'role',p_role));
  RETURN target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION platform_assign_organization_user(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_assign_organization_user(UUID,TEXT,TEXT) TO authenticated;

DROP POLICY IF EXISTS "Platform admins manage organization modules" ON organization_module;
CREATE POLICY "Platform admins manage organization modules" ON organization_module FOR ALL TO authenticated
USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "Platform admins view memberships" ON user_organization;
CREATE POLICY "Platform admins view memberships" ON user_organization FOR SELECT TO authenticated
USING (is_platform_admin());

-- Make newly-created RPC functions immediately visible to Supabase Data API.
NOTIFY pgrst, 'reload schema';
