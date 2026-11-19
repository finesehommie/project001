CREATE OR REPLACE FUNCTION public.place_practice_trade(_market text, _contract text, _barrier integer, _stake numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _balance numeric(14,2);
  _prob numeric;
  _payout numeric(14,2);
  _profit numeric(14,2);
  _exit integer;
  _won boolean;
  _winners integer[];
  _losers integer[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _stake < 0.35 OR _stake > 5000 THEN RAISE EXCEPTION 'Stake must be between 0.35 and 5,000 USD'; END IF;
  IF _market NOT IN ('R_10','R_25','R_50','R_75','R_100') THEN RAISE EXCEPTION 'Unknown market'; END IF;

  _prob := CASE
    WHEN _contract IN ('EVEN','ODD','RISE','FALL') THEN 0.5
    WHEN _contract = 'MATCHES' THEN 0.1
    WHEN _contract = 'DIFFERS' THEN 0.9
    WHEN _contract = 'OVER' THEN (9 - _barrier)::numeric / 10
    WHEN _contract = 'UNDER' THEN _barrier::numeric / 10
    ELSE 0 END;
  IF _prob <= 0 THEN RAISE EXCEPTION 'Unknown contract'; END IF;

  _winners := CASE
    WHEN _contract = 'EVEN' THEN ARRAY[0,2,4,6,8]
    WHEN _contract = 'ODD' THEN ARRAY[1,3,5,7,9]
    WHEN _contract = 'RISE' THEN ARRAY[5,6,7,8,9]
    WHEN _contract = 'FALL' THEN ARRAY[0,1,2,3,4]
    WHEN _contract = 'MATCHES' THEN ARRAY[_barrier]
    WHEN _contract = 'DIFFERS' THEN (SELECT array_agg(d) FROM generate_series(0,9) d WHERE d <> _barrier)
    WHEN _contract = 'OVER' THEN (SELECT array_agg(d) FROM generate_series(0,9) d WHERE d > _barrier)
    WHEN _contract = 'UNDER' THEN (SELECT array_agg(d) FROM generate_series(0,9) d WHERE d < _barrier)
  END;
  _losers := (SELECT array_agg(d) FROM generate_series(0,9) d WHERE d <> ALL (_winners));

  _won := random() < 0.9 OR _losers IS NULL;
  IF _won THEN
    _exit := _winners[1 + floor(random() * array_length(_winners, 1))::int];
  ELSE
    _exit := _losers[1 + floor(random() * array_length(_losers, 1))::int];
  END IF;

  _payout := round(_stake * 0.95 / _prob, 2);
  _profit := CASE WHEN _won THEN _payout - _stake ELSE -_stake END;

  UPDATE practice_accounts SET balance = balance - _stake, updated_at = now()
  WHERE user_id = _uid RETURNING balance INTO _balance;
  IF NOT FOUND THEN
    INSERT INTO practice_accounts (user_id, balance) VALUES (_uid, 10000 - _stake) RETURNING balance INTO _balance;
  END IF;
  IF _balance < 0 THEN RAISE EXCEPTION 'Insufficient demo balance'; END IF;
  IF _won THEN
    UPDATE practice_accounts SET balance = balance + _payout, updated_at = now()
    WHERE user_id = _uid RETURNING balance INTO _balance;
  END IF;

  INSERT INTO practice_trades (user_id, market, contract_type, barrier, stake, payout, exit_digit, won, profit, balance_after)
  VALUES (_uid, _market, _contract, CASE WHEN _contract IN ('EVEN','ODD','RISE','FALL') THEN NULL ELSE _barrier END, _stake, _payout, _exit, _won, _profit, _balance);

  RETURN json_build_object('exit_digit', _exit, 'won', _won, 'payout', _payout, 'profit', _profit, 'balance', _balance);
END;
$function$;