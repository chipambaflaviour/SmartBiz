-- SmartBiz RevPOS-style hierarchy and authorization hardening.
-- Platform backoffice -> organization workspace -> branches.
--
-- Apply after schema.sql, rls.sql, blueprint_alignment.sql, and
-- tenant_access_management.sql. This migration is safe to run repeatedly.

BEGIN;

-- ---------------------------------------------------------------------------
-- Structural constraints and branch assignment tables
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_organization_role_check'
      AND conrelid = 'public.user_organization'::regclass
  ) THEN
    ALTER TABLE public.user_organization
      ADD CONSTRAINT user_organization_role_check
      CHECK (role IN ('owner', 'admin', 'manager', 'member', 'auditor')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organization_no_child_organizations_check'
      AND conrelid = 'public.organization'::regclass
  ) THEN
    ALTER TABLE public.organization
      ADD CONSTRAINT organization_no_child_organizations_check
      CHECK (parent_organization_id IS NULL) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.branch_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branch(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, module_key),
  FOREIGN KEY (organization_id, module_key)
    REFERENCES public.organization_module(organization_id, module_key)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.user_branch_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branch(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id, branch_id),
  FOREIGN KEY (user_id, organization_id)
    REFERENCES public.user_organization(user_id, organization_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_branch_module_access_lookup
  ON public.branch_module_access(organization_id, branch_id, module_key)
  WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_branch_access_lookup
  ON public.user_branch_access(user_id, organization_id, branch_id)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_branch_org_active
  ON public.branch(organization_id, id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_org_branch_active
  ON public.employee(organization_id, branch_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sale_org_branch_date
  ON public.sale(organization_id, branch_id, sale_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_org_branch_status
  ON public.invoice(organization_id, branch_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_org_branch_active
  ON public.warehouse(organization_id, branch_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.branch_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branch_access ENABLE ROW LEVEL SECURITY;

-- Existing branches initially inherit the organization's enabled commercial
-- entitlements. Organization owners can narrow this set after migration.
INSERT INTO public.branch_module_access (
  organization_id, branch_id, module_key, is_enabled, assigned_by
)
SELECT branch.organization_id, branch.id, entitlement.module_key, TRUE,
       entitlement.assigned_by
FROM public.branch AS branch
JOIN public.organization_module AS entitlement
  ON entitlement.organization_id = branch.organization_id
 AND entitlement.is_enabled = TRUE
WHERE branch.deleted_at IS NULL
ON CONFLICT (branch_id, module_key) DO NOTHING;

INSERT INTO public.user_branch_access (
  user_id, organization_id, branch_id, is_active, assigned_by
)
SELECT membership.user_id, membership.organization_id, membership.branch_id,
       membership.is_active, NULL
FROM public.user_organization AS membership
WHERE membership.branch_id IS NOT NULL
ON CONFLICT (user_id, organization_id, branch_id)
DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW();

-- ---------------------------------------------------------------------------
-- Hardened SECURITY DEFINER authorization helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admin AS administrator
    WHERE administrator.user_id = auth.uid()
      AND administrator.is_active = TRUE
      AND administrator.role = 'platform_admin'
  );
$$;

-- Keep the legacy input name `org_id`. PostgreSQL identifies this function by
-- argument type, but CREATE OR REPLACE refuses to rename an existing input.
CREATE OR REPLACE FUNCTION public.user_in_org(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.user_organization AS membership
    JOIN public.organization AS organization
      ON organization.id = membership.organization_id
    WHERE membership.user_id = auth.uid()
      AND membership.organization_id = org_id
      AND membership.is_active = TRUE
      AND organization.deleted_at IS NULL
      AND organization.status IN ('trial', 'active', 'pending_payment', 'suspended', 'expired')
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_organization_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ARRAY(
    SELECT membership.organization_id
    FROM public.user_organization AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(
  org_id UUID,
  role_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.user_organization AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.organization_id = org_id
      AND membership.role = role_name
      AND membership.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.user_is_org_administrator(p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1
    FROM public.user_organization AS membership
    WHERE membership.user_id = auth.uid()
      AND membership.organization_id = p_organization_id
      AND membership.role IN ('owner', 'admin')
      AND membership.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_branch(
  p_organization_id UUID,
  p_branch_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.user_is_org_administrator(p_organization_id)
    OR (
      p_branch_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.branch AS branch
        WHERE branch.id = p_branch_id
          AND branch.organization_id = p_organization_id
          AND branch.deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1
        FROM public.user_organization AS membership
        WHERE membership.user_id = auth.uid()
          AND membership.organization_id = p_organization_id
          AND membership.is_active = TRUE
      )
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_branch_access AS access
          WHERE access.user_id = auth.uid()
            AND access.organization_id = p_organization_id
            AND access.branch_id = p_branch_id
            AND access.is_active = TRUE
        )
        OR EXISTS (
          SELECT 1
          FROM public.user_organization AS membership
          WHERE membership.user_id = auth.uid()
            AND membership.organization_id = p_organization_id
            AND membership.branch_id = p_branch_id
            AND membership.is_active = TRUE
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_can(
  p_organization_id UUID,
  p_module_key TEXT,
  p_action TEXT DEFAULT 'view',
  p_branch_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p_action IN ('view', 'create', 'update', 'delete')
    AND (
      public.user_is_org_administrator(p_organization_id)
      OR (
        public.user_in_org(p_organization_id)
        AND EXISTS (
          SELECT 1
          FROM public.organization_module AS entitlement
          WHERE entitlement.organization_id = p_organization_id
            AND entitlement.module_key = p_module_key
            AND entitlement.is_enabled = TRUE
            AND (entitlement.starts_at IS NULL OR entitlement.starts_at <= NOW())
            AND (entitlement.expires_at IS NULL OR entitlement.expires_at > NOW())
        )
        AND (
          p_branch_id IS NULL
          OR (
            public.user_can_access_branch(p_organization_id, p_branch_id)
            AND EXISTS (
              SELECT 1
              FROM public.branch_module_access AS branch_module
              WHERE branch_module.organization_id = p_organization_id
                AND branch_module.branch_id = p_branch_id
                AND branch_module.module_key = p_module_key
                AND branch_module.is_enabled = TRUE
            )
          )
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_module_access AS permission
          WHERE permission.user_id = auth.uid()
            AND permission.organization_id = p_organization_id
            AND permission.module_key = p_module_key
            AND CASE p_action
              WHEN 'view' THEN permission.can_view
              WHEN 'create' THEN permission.can_create
              WHEN 'update' THEN permission.can_update
              WHEN 'delete' THEN permission.can_delete
              ELSE FALSE
            END
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_view_employee_salary(
  p_organization_id UUID,
  p_branch_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.user_is_org_administrator(p_organization_id)
    OR public.user_can(p_organization_id, 'payroll', 'view', p_branch_id);
$$;

CREATE OR REPLACE FUNCTION public.organization_can_transact(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization AS organization
    WHERE organization.id = org_id
      AND organization.deleted_at IS NULL
      AND organization.status IN ('trial', 'active')
      AND (
        organization.subscription_expires_at IS NULL
        OR organization.subscription_expires_at > NOW()
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_in_org(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_organization_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_has_role(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_is_org_administrator(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can_access_branch(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_can(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_employee_salary(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organization_can_transact(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_in_org(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_org_administrator(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_branch(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can(UUID, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_employee_salary(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organization_can_transact(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Integrity and entitlement triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_branch_belongs_to_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.branch AS branch
    WHERE branch.id = NEW.branch_id
      AND branch.organization_id = NEW.organization_id
      AND branch.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch % does not belong to organization %',
      NEW.branch_id, NEW.organization_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_branch_module_entitlement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.branch AS branch
    WHERE branch.id = NEW.branch_id
      AND branch.organization_id = NEW.organization_id
      AND branch.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to organization' USING ERRCODE = '23514';
  END IF;

  IF NEW.is_enabled AND NOT EXISTS (
    SELECT 1
    FROM public.organization_module AS entitlement
    WHERE entitlement.organization_id = NEW.organization_id
      AND entitlement.module_key = NEW.module_key
      AND entitlement.is_enabled = TRUE
      AND (entitlement.starts_at IS NULL OR entitlement.starts_at <= NOW())
      AND (entitlement.expires_at IS NULL OR entitlement.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'Module % is not an enabled organization entitlement', NEW.module_key
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.disable_descendant_module_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.is_enabled = TRUE AND NEW.is_enabled = FALSE THEN
    UPDATE public.branch_module_access
       SET is_enabled = FALSE, updated_at = NOW()
     WHERE organization_id = NEW.organization_id
       AND module_key = NEW.module_key
       AND is_enabled = TRUE;
    DELETE FROM public.user_module_access
     WHERE organization_id = NEW.organization_id
       AND module_key = NEW.module_key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_branch_module_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'branch' THEN
    INSERT INTO public.branch_module_access (
      organization_id, branch_id, module_key, is_enabled, assigned_by
    )
    SELECT NEW.organization_id, NEW.id, entitlement.module_key, TRUE, auth.uid()
    FROM public.organization_module AS entitlement
    WHERE entitlement.organization_id = NEW.organization_id
      AND entitlement.is_enabled = TRUE
      AND (entitlement.starts_at IS NULL OR entitlement.starts_at <= NOW())
      AND (entitlement.expires_at IS NULL OR entitlement.expires_at > NOW())
    ON CONFLICT (branch_id, module_key) DO NOTHING;
  ELSE
    INSERT INTO public.branch_module_access (
      organization_id, branch_id, module_key, is_enabled, assigned_by
    )
    SELECT NEW.organization_id, branch.id, NEW.module_key, TRUE, NEW.assigned_by
    FROM public.branch AS branch
    WHERE branch.organization_id = NEW.organization_id
      AND branch.deleted_at IS NULL
      AND NEW.is_enabled = TRUE
    ON CONFLICT (branch_id, module_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_user_branch_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_organization AS membership
    WHERE membership.user_id = NEW.user_id
      AND membership.organization_id = NEW.organization_id
      AND membership.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'User is not an active member of the organization'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branch AS branch
    WHERE branch.id = NEW.branch_id
      AND branch.organization_id = NEW.organization_id
      AND branch.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to organization'
      USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'department', 'employee', 'warehouse', 'sale', 'invoice', 'user_organization'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_branch_org_guard ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_branch_org_guard BEFORE INSERT OR UPDATE OF organization_id, branch_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assert_branch_belongs_to_organization()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_module_entitlement ON public.branch_module_access;
CREATE TRIGGER trg_branch_module_entitlement
BEFORE INSERT OR UPDATE ON public.branch_module_access
FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_module_entitlement();

DROP TRIGGER IF EXISTS trg_disable_descendant_module_access ON public.organization_module;
CREATE TRIGGER trg_disable_descendant_module_access
AFTER UPDATE OF is_enabled ON public.organization_module
FOR EACH ROW EXECUTE FUNCTION public.disable_descendant_module_access();

DROP TRIGGER IF EXISTS trg_seed_branch_modules_from_branch ON public.branch;
CREATE TRIGGER trg_seed_branch_modules_from_branch
AFTER INSERT ON public.branch
FOR EACH ROW EXECUTE FUNCTION public.seed_branch_module_access();

DROP TRIGGER IF EXISTS trg_seed_branch_modules_from_entitlement ON public.organization_module;
CREATE TRIGGER trg_seed_branch_modules_from_entitlement
AFTER INSERT ON public.organization_module
FOR EACH ROW EXECUTE FUNCTION public.seed_branch_module_access();

DROP TRIGGER IF EXISTS trg_validate_user_branch_access ON public.user_branch_access;
CREATE TRIGGER trg_validate_user_branch_access
BEFORE INSERT OR UPDATE ON public.user_branch_access
FOR EACH ROW EXECUTE FUNCTION public.validate_user_branch_access();

-- ---------------------------------------------------------------------------
-- Remove privilege escalation and lock commercial entitlements
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can join orgs" ON public.user_organization;
DROP POLICY IF EXISTS "Owners can manage memberships" ON public.user_organization;

DROP POLICY IF EXISTS "RevPOS membership administrators" ON public.user_organization;
CREATE POLICY "RevPOS membership administrators"
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

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organization;

DROP POLICY IF EXISTS "Owners can manage modules" ON public.organization_module;
DROP POLICY IF EXISTS "Platform admins manage organization modules" ON public.organization_module;
DROP POLICY IF EXISTS "RevPOS platform manages commercial entitlements" ON public.organization_module;
CREATE POLICY "RevPOS platform manages commercial entitlements"
ON public.organization_module
FOR ALL TO authenticated
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Users can view modules in their org" ON public.organization_module;
DROP POLICY IF EXISTS "RevPOS members read commercial entitlements" ON public.organization_module;
CREATE POLICY "RevPOS members read commercial entitlements"
ON public.organization_module
FOR SELECT TO authenticated
USING (public.user_in_org(organization_id));

-- Branch-level module configuration can only narrow platform entitlements.
DROP POLICY IF EXISTS "RevPOS members read branch modules" ON public.branch_module_access;
CREATE POLICY "RevPOS members read branch modules"
ON public.branch_module_access
FOR SELECT TO authenticated
USING (
  public.user_is_org_administrator(organization_id)
  OR public.user_can_access_branch(organization_id, branch_id)
);

DROP POLICY IF EXISTS "RevPOS organization admins manage branch modules" ON public.branch_module_access;
CREATE POLICY "RevPOS organization admins manage branch modules"
ON public.branch_module_access
FOR ALL TO authenticated
USING (public.user_is_org_administrator(organization_id))
WITH CHECK (public.user_is_org_administrator(organization_id));

DROP POLICY IF EXISTS "RevPOS users read branch assignments" ON public.user_branch_access;
CREATE POLICY "RevPOS users read branch assignments"
ON public.user_branch_access
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.user_is_org_administrator(organization_id)
);

DROP POLICY IF EXISTS "RevPOS organization admins manage branch assignments" ON public.user_branch_access;
CREATE POLICY "RevPOS organization admins manage branch assignments"
ON public.user_branch_access
FOR ALL TO authenticated
USING (public.user_is_org_administrator(organization_id))
WITH CHECK (public.user_is_org_administrator(organization_id));

-- ---------------------------------------------------------------------------
-- Branch-aware business policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view branches in their org" ON public.branch;
DROP POLICY IF EXISTS "Admins can manage branches" ON public.branch;
DROP POLICY IF EXISTS "RevPOS branch visibility" ON public.branch;
DROP POLICY IF EXISTS "RevPOS branch administration" ON public.branch;
CREATE POLICY "RevPOS branch visibility" ON public.branch
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.user_is_org_administrator(organization_id)
    OR public.user_can_access_branch(organization_id, id)
  )
);
CREATE POLICY "RevPOS branch administration" ON public.branch
FOR ALL TO authenticated
USING (public.user_is_org_administrator(organization_id))
WITH CHECK (public.user_is_org_administrator(organization_id));

DROP POLICY IF EXISTS "Users can view employees in their org" ON public.employee;
DROP POLICY IF EXISTS "HR managers can manage employees" ON public.employee;
DROP POLICY IF EXISTS "RevPOS employee visibility" ON public.employee;
DROP POLICY IF EXISTS "RevPOS HR creates employees" ON public.employee;
DROP POLICY IF EXISTS "RevPOS HR updates employees" ON public.employee;
DROP POLICY IF EXISTS "RevPOS HR deletes employees" ON public.employee;
CREATE POLICY "RevPOS employee visibility" ON public.employee
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND (
    public.user_is_org_administrator(organization_id)
    OR user_id = auth.uid()
    OR public.user_can(organization_id, 'hr', 'view', branch_id)
    OR public.user_can(organization_id, 'payroll', 'view', branch_id)
  )
);
CREATE POLICY "RevPOS HR creates employees" ON public.employee
FOR INSERT TO authenticated
WITH CHECK (public.user_can(organization_id, 'hr', 'create', branch_id));
CREATE POLICY "RevPOS HR updates employees" ON public.employee
FOR UPDATE TO authenticated
USING (public.user_can(organization_id, 'hr', 'update', branch_id))
WITH CHECK (public.user_can(organization_id, 'hr', 'update', branch_id));
CREATE POLICY "RevPOS HR deletes employees" ON public.employee
FOR DELETE TO authenticated
USING (public.user_can(organization_id, 'hr', 'delete', branch_id));

DROP POLICY IF EXISTS "Users can view warehouses" ON public.warehouse;
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouse;
DROP POLICY IF EXISTS "Members can create first warehouse" ON public.warehouse;
DROP POLICY IF EXISTS "RevPOS warehouse visibility" ON public.warehouse;
DROP POLICY IF EXISTS "RevPOS warehouse administration" ON public.warehouse;
CREATE POLICY "RevPOS warehouse visibility" ON public.warehouse
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.user_can(organization_id, 'inventory', 'view', branch_id)
);
CREATE POLICY "RevPOS warehouse administration" ON public.warehouse
FOR ALL TO authenticated
USING (public.user_can(organization_id, 'inventory', 'update', branch_id))
WITH CHECK (public.user_can(organization_id, 'inventory', 'create', branch_id));

DROP POLICY IF EXISTS "Users can view stock levels" ON public.stock_level;
DROP POLICY IF EXISTS "Users can manage stock levels" ON public.stock_level;
DROP POLICY IF EXISTS "RevPOS stock visibility" ON public.stock_level;
DROP POLICY IF EXISTS "RevPOS stock administration" ON public.stock_level;
CREATE POLICY "RevPOS stock visibility" ON public.stock_level
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.warehouse AS warehouse
    WHERE warehouse.id = stock_level.warehouse_id
      AND warehouse.organization_id = stock_level.organization_id
      AND public.user_can(stock_level.organization_id, 'inventory', 'view', warehouse.branch_id)
  )
);
CREATE POLICY "RevPOS stock administration" ON public.stock_level
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.warehouse AS warehouse
    WHERE warehouse.id = stock_level.warehouse_id
      AND warehouse.organization_id = stock_level.organization_id
      AND public.user_can(stock_level.organization_id, 'inventory', 'update', warehouse.branch_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.warehouse AS warehouse
    WHERE warehouse.id = stock_level.warehouse_id
      AND warehouse.organization_id = stock_level.organization_id
      AND public.user_can(stock_level.organization_id, 'inventory', 'create', warehouse.branch_id)
  )
);

DROP POLICY IF EXISTS "Users can view sales" ON public.sale;
DROP POLICY IF EXISTS "Users can create sales" ON public.sale;
DROP POLICY IF EXISTS "Managers can update sales" ON public.sale;
DROP POLICY IF EXISTS "RevPOS sales visibility" ON public.sale;
DROP POLICY IF EXISTS "RevPOS sales creation" ON public.sale;
DROP POLICY IF EXISTS "RevPOS sales update" ON public.sale;
DROP POLICY IF EXISTS "RevPOS sales deletion" ON public.sale;
CREATE POLICY "RevPOS sales visibility" ON public.sale
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND public.user_can(organization_id, 'pos', 'view', branch_id));
CREATE POLICY "RevPOS sales creation" ON public.sale
FOR INSERT TO authenticated
WITH CHECK (
  branch_id IS NOT NULL
  AND public.organization_can_transact(organization_id)
  AND public.user_can(organization_id, 'pos', 'create', branch_id)
);
CREATE POLICY "RevPOS sales update" ON public.sale
FOR UPDATE TO authenticated
USING (public.user_can(organization_id, 'pos', 'update', branch_id))
WITH CHECK (public.user_can(organization_id, 'pos', 'update', branch_id));
CREATE POLICY "RevPOS sales deletion" ON public.sale
FOR DELETE TO authenticated
USING (public.user_can(organization_id, 'pos', 'delete', branch_id));

DROP POLICY IF EXISTS "Users can view sale items" ON public.sale_item;
DROP POLICY IF EXISTS "Users can create sale items" ON public.sale_item;
DROP POLICY IF EXISTS "RevPOS sale item visibility" ON public.sale_item;
DROP POLICY IF EXISTS "RevPOS sale item creation" ON public.sale_item;
CREATE POLICY "RevPOS sale item visibility" ON public.sale_item
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sale AS parent_sale
    WHERE parent_sale.id = sale_item.sale_id
      AND parent_sale.organization_id = sale_item.organization_id
      AND public.user_can(sale_item.organization_id, 'pos', 'view', parent_sale.branch_id)
  )
);
CREATE POLICY "RevPOS sale item creation" ON public.sale_item
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sale AS parent_sale
    WHERE parent_sale.id = sale_item.sale_id
      AND parent_sale.organization_id = sale_item.organization_id
      AND public.user_can(sale_item.organization_id, 'pos', 'create', parent_sale.branch_id)
  )
);

DROP POLICY IF EXISTS "Users can view invoices" ON public.invoice;
DROP POLICY IF EXISTS "Users can manage invoices" ON public.invoice;
DROP POLICY IF EXISTS "RevPOS invoice visibility" ON public.invoice;
DROP POLICY IF EXISTS "RevPOS invoice administration" ON public.invoice;
CREATE POLICY "RevPOS invoice visibility" ON public.invoice
FOR SELECT TO authenticated
USING (deleted_at IS NULL AND public.user_can(organization_id, 'pos', 'view', branch_id));
CREATE POLICY "RevPOS invoice administration" ON public.invoice
FOR ALL TO authenticated
USING (public.user_can(organization_id, 'pos', 'update', branch_id))
WITH CHECK (
  branch_id IS NOT NULL
  AND public.organization_can_transact(organization_id)
  AND public.user_can(organization_id, 'pos', 'create', branch_id)
);

DROP POLICY IF EXISTS "Users can view payments" ON public.invoice_payment;
DROP POLICY IF EXISTS "Users can create payments" ON public.invoice_payment;
DROP POLICY IF EXISTS "RevPOS invoice payment visibility" ON public.invoice_payment;
DROP POLICY IF EXISTS "RevPOS invoice payment creation" ON public.invoice_payment;
CREATE POLICY "RevPOS invoice payment visibility" ON public.invoice_payment
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoice AS parent_invoice
    WHERE parent_invoice.id = invoice_payment.invoice_id
      AND parent_invoice.organization_id = invoice_payment.organization_id
      AND public.user_can(invoice_payment.organization_id, 'pos', 'view', parent_invoice.branch_id)
  )
);
CREATE POLICY "RevPOS invoice payment creation" ON public.invoice_payment
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoice AS parent_invoice
    WHERE parent_invoice.id = invoice_payment.invoice_id
      AND parent_invoice.organization_id = invoice_payment.organization_id
      AND public.user_can(invoice_payment.organization_id, 'pos', 'create', parent_invoice.branch_id)
  )
);

DROP POLICY IF EXISTS "Members read sale payments" ON public.sale_payment;
DROP POLICY IF EXISTS "Active members create sale payments" ON public.sale_payment;
DROP POLICY IF EXISTS "RevPOS sale payment visibility" ON public.sale_payment;
DROP POLICY IF EXISTS "RevPOS sale payment creation" ON public.sale_payment;
CREATE POLICY "RevPOS sale payment visibility" ON public.sale_payment
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sale AS parent_sale
    WHERE parent_sale.id = sale_payment.sale_id
      AND parent_sale.organization_id = sale_payment.organization_id
      AND public.user_can(sale_payment.organization_id, 'pos', 'view', parent_sale.branch_id)
  )
);
CREATE POLICY "RevPOS sale payment creation" ON public.sale_payment
FOR INSERT TO authenticated
WITH CHECK (
  public.organization_can_transact(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.sale AS parent_sale
    WHERE parent_sale.id = sale_payment.sale_id
      AND parent_sale.organization_id = sale_payment.organization_id
      AND public.user_can(sale_payment.organization_id, 'pos', 'create', parent_sale.branch_id)
  )
);

-- Existing user module grants remain bounded by enabled organization
-- entitlements. The helper enforces the branch subset at data-access time.
DROP POLICY IF EXISTS "Organization admins manage module access" ON public.user_module_access;
DROP POLICY IF EXISTS "RevPOS organization admins manage user module access" ON public.user_module_access;
CREATE POLICY "RevPOS organization admins manage user module access"
ON public.user_module_access
FOR ALL TO authenticated
USING (public.user_is_org_administrator(organization_id))
WITH CHECK (
  public.user_is_org_administrator(organization_id)
  AND EXISTS (
    SELECT 1 FROM public.organization_module AS entitlement
    WHERE entitlement.organization_id = user_module_access.organization_id
      AND entitlement.module_key = user_module_access.module_key
      AND entitlement.is_enabled = TRUE
      AND (entitlement.starts_at IS NULL OR entitlement.starts_at <= NOW())
      AND (entitlement.expires_at IS NULL OR entitlement.expires_at > NOW())
  )
);

-- Replace legacy SECURITY DEFINER inventory entry points so they cannot bypass
-- the branch-aware policies above.
CREATE OR REPLACE FUNCTION public.set_stock_level(
  p_organization_id UUID,
  p_product_id UUID,
  p_warehouse_id UUID,
  p_quantity NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous_quantity NUMERIC;
  target_branch_id UUID;
BEGIN
  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative' USING ERRCODE = '22003';
  END IF;

  SELECT warehouse.branch_id INTO target_branch_id
  FROM public.warehouse AS warehouse
  WHERE warehouse.id = p_warehouse_id
    AND warehouse.organization_id = p_organization_id
    AND warehouse.deleted_at IS NULL;

  IF target_branch_id IS NULL THEN
    RAISE EXCEPTION 'A branch-scoped warehouse is required' USING ERRCODE = '23514';
  END IF;
  IF NOT public.user_can(p_organization_id, 'inventory', 'update', target_branch_id) THEN
    RAISE EXCEPTION 'Inventory update permission required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.product AS product
    WHERE product.id = p_product_id
      AND product.organization_id = p_organization_id
      AND product.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Product not found in this organization' USING ERRCODE = '23503';
  END IF;

  SELECT stock.quantity INTO previous_quantity
  FROM public.stock_level AS stock
  WHERE stock.product_id = p_product_id
    AND stock.warehouse_id = p_warehouse_id
  FOR UPDATE;

  INSERT INTO public.stock_level (organization_id, product_id, warehouse_id, quantity)
  VALUES (p_organization_id, p_product_id, p_warehouse_id, p_quantity)
  ON CONFLICT (product_id, warehouse_id)
  DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW();

  IF previous_quantity IS DISTINCT FROM p_quantity THEN
    INSERT INTO public.audit_log (
      organization_id, user_id, module, action, entity_type, entity_id,
      old_data, new_data
    ) VALUES (
      p_organization_id, auth.uid(), 'inventory', 'stock_level.set',
      'product', p_product_id,
      jsonb_build_object('warehouse_id', p_warehouse_id, 'quantity', previous_quantity),
      jsonb_build_object('warehouse_id', p_warehouse_id, 'quantity', p_quantity)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_stock_level(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_stock_level(UUID, UUID, UUID, NUMERIC) TO authenticated;

-- The legacy decrement_stock signature has no warehouse/branch argument and
-- therefore cannot safely serve tenant clients in a multi-branch system.
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decrement_stock(UUID, UUID, NUMERIC) FROM authenticated;

-- Replace a branch's module subset atomically. This avoids leaving a branch
-- with no modules if a client fails between separate delete/insert requests.
CREATE OR REPLACE FUNCTION public.set_branch_modules(
  p_organization_id UUID,
  p_branch_id UUID,
  p_module_keys TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.user_is_org_administrator(p_organization_id) THEN
    RAISE EXCEPTION 'Organization administrator access required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branch
    WHERE id = p_branch_id
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to this organization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_module_keys, ARRAY[]::TEXT[])) AS requested(module_key)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_module AS entitlement
      WHERE entitlement.organization_id = p_organization_id
        AND entitlement.module_key = requested.module_key
        AND entitlement.is_enabled
    )
  ) THEN
    RAISE EXCEPTION 'A requested module is not purchased by this organization';
  END IF;

  DELETE FROM public.branch_module_access
  WHERE organization_id = p_organization_id
    AND branch_id = p_branch_id;

  INSERT INTO public.branch_module_access (
    organization_id, branch_id, module_key, is_enabled, created_by, updated_by
  )
  SELECT p_organization_id, p_branch_id, requested.module_key, TRUE, auth.uid(), auth.uid()
  FROM (
    SELECT DISTINCT module_key
    FROM unnest(COALESCE(p_module_keys, ARRAY[]::TEXT[])) AS expanded(module_key)
  ) AS requested;
END;
$$;

REVOKE ALL ON FUNCTION public.set_branch_modules(UUID, UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_modules(UUID, UUID, TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- Audit access-control mutations without allowing callers to forge audit rows
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_access_control_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  audit_organization_id UUID;
  audit_entity_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    audit_organization_id := OLD.organization_id;
    audit_entity_id := OLD.id;
  ELSE
    audit_organization_id := NEW.organization_id;
    audit_entity_id := NEW.id;
  END IF;

  INSERT INTO public.audit_log (
    organization_id, user_id, module, action, entity_type, entity_id,
    old_data, new_data, metadata
  ) VALUES (
    audit_organization_id,
    auth.uid(),
    'security',
    TG_OP,
    TG_TABLE_NAME,
    audit_entity_id,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    jsonb_build_object('source', 'database_trigger')
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_module', 'branch_module_access', 'user_branch_access',
    'user_module_access', 'user_organization'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_access_control_change()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_branch_belongs_to_organization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_branch_module_entitlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disable_descendant_module_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_branch_module_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_user_branch_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_access_control_change() FROM PUBLIC;

-- Audit rows are emitted by trusted functions/triggers. Authenticated callers
-- must not be able to forge security history directly.
DROP POLICY IF EXISTS "Authenticated audit inserts" ON public.audit_log;

NOTIFY pgrst, 'reload schema';

COMMIT;
