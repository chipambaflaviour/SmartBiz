-- SmartBiz: restore module access for organizations whose organization_module
-- rows were removed. Enables every catalogue module for every active
-- organization. Trim per-organization afterwards from Control Center.
-- Safe to rerun.

INSERT INTO public.organization_module (organization_id, module_key, is_enabled)
SELECT o.id, m.key, TRUE
FROM public.organization o
CROSS JOIN public.module_catalog m
WHERE o.deleted_at IS NULL
ON CONFLICT (organization_id, module_key) DO UPDATE SET is_enabled = TRUE;

NOTIFY pgrst, 'reload schema';
