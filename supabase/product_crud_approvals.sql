-- Product CRUD authorization, approval payloads and optional product images.
-- Run once in the Supabase SQL editor.

ALTER TABLE public.approval_request
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS requested_changes JSONB;

DROP POLICY IF EXISTS "Users can manage products" ON public.product;
DROP POLICY IF EXISTS "Members can create products" ON public.product;
DROP POLICY IF EXISTS "Admins can update products" ON public.product;
DROP POLICY IF EXISTS "Admins can delete products" ON public.product;

CREATE POLICY "Members can create products"
  ON public.product FOR INSERT TO authenticated
  WITH CHECK (public.user_in_org(organization_id));

CREATE POLICY "Admins can update products"
  ON public.product FOR UPDATE TO authenticated
  USING (public.user_is_org_administrator(organization_id))
  WITH CHECK (public.user_is_org_administrator(organization_id));

CREATE POLICY "Admins can delete products"
  ON public.product FOR DELETE TO authenticated
  USING (public.user_is_org_administrator(organization_id));

DROP POLICY IF EXISTS "Approvers can update approvals" ON public.approval_request;
DROP POLICY IF EXISTS "Assigned approvers decide requests" ON public.approval_request;
CREATE POLICY "Assigned approvers decide requests"
  ON public.approval_request FOR UPDATE TO authenticated
  USING (approver_id=auth.uid() OR public.user_is_org_administrator(organization_id))
  WITH CHECK (approver_id=auth.uid() OR public.user_is_org_administrator(organization_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', TRUE, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET public=EXCLUDED.public, file_size_limit=EXCLUDED.file_size_limit, allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Members upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;

CREATE POLICY "Members upload product images" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='product-images' AND public.user_in_org(((storage.foldername(name))[1])::UUID));

CREATE POLICY "Admins update product images" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='product-images' AND public.user_is_org_administrator(((storage.foldername(name))[1])::UUID));

CREATE POLICY "Admins delete product images" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='product-images' AND public.user_is_org_administrator(((storage.foldername(name))[1])::UUID));

NOTIFY pgrst, 'reload schema';
