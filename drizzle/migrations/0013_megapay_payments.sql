CREATE TABLE public.megapay_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_kes bigint NOT NULL CHECK (amount_kes > 0),
  msisdn text NOT NULL,
  reference text NOT NULL UNIQUE,
  transaction_request_id text UNIQUE,
  transaction_id text UNIQUE,
  status text NOT NULL DEFAULT 'initiating'
    CHECK (status IN ('initiating', 'pending', 'completed', 'failed', 'review')),
  receipt text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX megapay_payments_user_created_idx
  ON public.megapay_payments(user_id, created_at DESC);

CREATE UNIQUE INDEX megapay_payments_one_open_per_user_idx
  ON public.megapay_payments(user_id)
  WHERE status IN ('initiating', 'pending', 'review');

GRANT SELECT ON public.megapay_payments TO authenticated;
GRANT ALL ON public.megapay_payments TO service_role;

ALTER TABLE public.megapay_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own MegaPay payments"
  ON public.megapay_payments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
