-- Inventory packaging and controlled stock write-offs.
ALTER TABLE public.product
  ADD COLUMN IF NOT EXISTS base_unit TEXT NOT NULL DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS pack_unit TEXT,
  ADD COLUMN IF NOT EXISTS units_per_pack NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS pack_price NUMERIC(15,4);

ALTER TABLE public.product DROP CONSTRAINT IF EXISTS product_units_per_pack_check;
ALTER TABLE public.product ADD CONSTRAINT product_units_per_pack_check
  CHECK (units_per_pack IS NULL OR units_per_pack > 1);

ALTER TABLE public.product DROP CONSTRAINT IF EXISTS product_pack_price_check;
ALTER TABLE public.product ADD CONSTRAINT product_pack_price_check
  CHECK (pack_price IS NULL OR pack_price >= 0);

ALTER TABLE public.sale_item
  ADD COLUMN IF NOT EXISTS sale_unit TEXT NOT NULL DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS unit_multiplier NUMERIC(15,4) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.stock_write_off (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branch(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouse(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.product(id) ON DELETE RESTRICT,
  quantity NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
  reason_category TEXT NOT NULL CHECK (reason_category IN ('damaged','expired','lost','spoiled','other')),
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approval_request_id UUID REFERENCES public.approval_request(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

ALTER TABLE public.stock_write_off ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members view stock write offs" ON public.stock_write_off;
CREATE POLICY "Members view stock write offs" ON public.stock_write_off FOR SELECT TO authenticated
  USING (public.user_in_org(organization_id));
DROP POLICY IF EXISTS "Members request stock write offs" ON public.stock_write_off;
CREATE POLICY "Members request stock write offs" ON public.stock_write_off FOR INSERT TO authenticated
  WITH CHECK (public.user_in_org(organization_id));
DROP POLICY IF EXISTS "Admins decide stock write offs" ON public.stock_write_off;
CREATE POLICY "Admins decide stock write offs" ON public.stock_write_off FOR UPDATE TO authenticated
  USING (public.user_is_org_administrator(organization_id))
  WITH CHECK (public.user_is_org_administrator(organization_id));

CREATE INDEX IF NOT EXISTS idx_stock_write_off_org_status ON public.stock_write_off(organization_id, status, created_at DESC);

NOTIFY pgrst, 'reload schema';
