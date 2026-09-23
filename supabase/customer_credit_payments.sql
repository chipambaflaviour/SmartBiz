-- Atomic customer credit repayment support.
-- Safe to run more than once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.record_customer_credit_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  previous_balance NUMERIC,
  new_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_customer public.customer%ROWTYPE;
  v_transaction_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF p_payment_method NOT IN ('cash', 'mobile_money', 'card', 'bank_transfer') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  SELECT *
    INTO v_customer
    FROM public.customer
   WHERE id = p_customer_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF NOT public.user_in_org(v_customer.organization_id) THEN
    RAISE EXCEPTION 'You do not have access to this customer';
  END IF;

  IF NOT public.organization_can_transact(v_customer.organization_id) THEN
    RAISE EXCEPTION 'Organization access is inactive';
  END IF;

  IF v_customer.outstanding_balance <= 0 THEN
    RAISE EXCEPTION 'This customer has no outstanding balance';
  END IF;

  IF p_amount > v_customer.outstanding_balance THEN
    RAISE EXCEPTION 'Payment cannot exceed the outstanding balance';
  END IF;

  INSERT INTO public.customer_credit_transaction (
    organization_id,
    customer_id,
    type,
    amount,
    payment_method,
    reference,
    notes,
    created_by
  ) VALUES (
    v_customer.organization_id,
    v_customer.id,
    'payment',
    p_amount,
    p_payment_method,
    NULLIF(BTRIM(p_reference), ''),
    NULLIF(BTRIM(p_notes), ''),
    auth.uid()
  )
  RETURNING id INTO v_transaction_id;

  UPDATE public.customer
     SET outstanding_balance = outstanding_balance - p_amount,
         updated_at = NOW()
   WHERE id = v_customer.id;

  RETURN QUERY SELECT
    v_transaction_id,
    v_customer.outstanding_balance,
    v_customer.outstanding_balance - p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_credit_payment(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- Ask PostgREST to refresh immediately so the RPC is visible without waiting
-- for its normal schema-cache refresh interval.
NOTIFY pgrst, 'reload schema';
