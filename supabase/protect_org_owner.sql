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
