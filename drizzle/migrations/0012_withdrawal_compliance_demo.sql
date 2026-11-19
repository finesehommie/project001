INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('withdrawal_demo_compliance_amount', '0', now())
ON CONFLICT (key) DO NOTHING;

CREATE POLICY site_settings_withdrawal_demo_read
ON public.site_settings
FOR SELECT TO authenticated
USING (key = 'withdrawal_demo_compliance_amount');

CREATE OR REPLACE FUNCTION public.admin_set_withdrawal_demo_compliance_amount(_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
  IF _amount IS NULL OR _amount < 0 OR _amount > 10000 THEN
    RAISE EXCEPTION 'Demo amount must be between 0 and 10,000 USD';
  END IF;
  INSERT INTO public.site_settings (key, value, updated_at)
  VALUES ('withdrawal_demo_compliance_amount', _amount::text, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN _amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_withdrawal_demo_compliance_amount(numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_withdrawal_demo_compliance_amount(numeric) TO authenticated;
