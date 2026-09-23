CREATE OR REPLACE FUNCTION public.apply_stock_write_off(
  p_organization_id UUID, p_product_id UUID, p_stock_level_id UUID,
  p_quantity NUMERIC, p_reason_category TEXT, p_reason TEXT,
  p_requested_by UUID, p_approval_request_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_level public.stock_level%ROWTYPE;
  v_branch_id UUID;
  v_id UUID;
BEGIN
  IF NOT public.user_is_org_administrator(p_organization_id) THEN RAISE EXCEPTION 'Organization administrator access required'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'Write-off quantity must be greater than zero'; END IF;
  SELECT * INTO v_level FROM public.stock_level WHERE id=p_stock_level_id AND organization_id=p_organization_id AND product_id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock level not found'; END IF;
  IF v_level.quantity < p_quantity THEN RAISE EXCEPTION 'Only % units remain in stock', v_level.quantity; END IF;
  SELECT branch_id INTO v_branch_id FROM public.warehouse WHERE id=v_level.warehouse_id;
  UPDATE public.stock_level SET quantity=quantity-p_quantity, updated_at=NOW() WHERE id=v_level.id;
  INSERT INTO public.stock_write_off(organization_id,branch_id,warehouse_id,product_id,quantity,reason_category,reason,requested_by,approved_by,approval_request_id,status,decided_at)
  VALUES(p_organization_id,v_branch_id,v_level.warehouse_id,p_product_id,p_quantity,p_reason_category,p_reason,p_requested_by,auth.uid(),p_approval_request_id,'approved',NOW()) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stock_write_off(UUID,UUID,UUID,NUMERIC,TEXT,TEXT,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_stock_write_off(UUID,UUID,UUID,NUMERIC,TEXT,TEXT,UUID,UUID) TO authenticated;
NOTIFY pgrst, 'reload schema';
