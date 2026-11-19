CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  reward numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz
);
GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View own referrals" ON public.referrals FOR SELECT TO authenticated
USING (auth.uid() = referrer_id OR auth.uid() = referred_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.referral_code_for(_uid uuid) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT upper(substr(replace(_uid::text, '-', ''), 1, 8))
$$;

CREATE OR REPLACE FUNCTION public.claim_referral(_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _ref uuid; _created timestamptz;
BEGIN
  IF _me IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT created_at INTO _created FROM auth.users WHERE id = _me;
  IF _created < now() - interval '7 days' THEN RETURN false; END IF;
  SELECT id INTO _ref FROM auth.users WHERE public.referral_code_for(id) = upper(trim(_code)) LIMIT 1;
  IF _ref IS NULL OR _ref = _me THEN RETURN false; END IF;
  INSERT INTO public.referrals (referrer_id, referred_id) VALUES (_ref, _me) ON CONFLICT (referred_id) DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.check_referral_reward(_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r public.referrals; _amt numeric;
BEGIN
  SELECT * INTO _r FROM public.referrals WHERE referred_id = _uid AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deposits WHERE user_id = _uid AND status = 'completed' AND method <> 'Referral bonus') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.practice_trades WHERE user_id = _uid) THEN RETURN; END IF;
  SELECT COALESCE(NULLIF(value,'')::numeric, 10) INTO _amt FROM public.site_settings WHERE key = 'referral_reward';
  _amt := COALESCE(_amt, 10);
  UPDATE public.referrals SET status = 'rewarded', reward = _amt, rewarded_at = now() WHERE id = _r.id;
  INSERT INTO public.deposits (user_id, amount, method, status, note)
  VALUES (_r.referrer_id, _amt, 'Referral bonus', 'completed', 'Referral reward');
END $$;

CREATE OR REPLACE FUNCTION public.referral_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'deposits' AND NEW.status <> 'completed' THEN RETURN NEW; END IF;
  PERFORM public.check_referral_reward(NEW.user_id);
  RETURN NEW;
END $$;

CREATE TRIGGER deposits_referral AFTER INSERT OR UPDATE OF status ON public.deposits
FOR EACH ROW EXECUTE FUNCTION public.referral_trigger();
CREATE TRIGGER trades_referral AFTER INSERT ON public.practice_trades
FOR EACH ROW EXECUTE FUNCTION public.referral_trigger();

CREATE OR REPLACE FUNCTION public.admin_set_referral_reward(_amount numeric) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF _amount < 0 OR _amount > 10000 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  INSERT INTO public.site_settings(key, value) VALUES ('referral_reward', _amount::text)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN _amount;
END $$;

CREATE OR REPLACE FUNCTION public.get_referral_reward() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT NULLIF(value,'')::numeric FROM public.site_settings WHERE key='referral_reward'), 10)
$$;