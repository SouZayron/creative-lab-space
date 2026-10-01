CREATE TABLE public.daily_challenges (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_id uuid NOT NULL REFERENCES public.daily_players(id) ON DELETE CASCADE, target_id uuid NOT NULL REFERENCES public.daily_players(id) ON DELETE CASCADE, milestone_day date NOT NULL, coins_taken integer NOT NULL DEFAULT 5, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (player_id, milestone_day), FOREIGN KEY (player_id, milestone_day) REFERENCES public.daily_checkins(player_id, day) ON DELETE CASCADE, CHECK (player_id <> target_id));
GRANT ALL ON public.daily_challenges TO service_role;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.daily_available_challenges(p_id uuid) RETURNS TABLE(milestone_day date) LANGUAGE sql STABLE SET search_path = public AS $$
  WITH numbered AS (
    SELECT day, row_number() OVER (ORDER BY day) AS day_number FROM public.daily_checkins WHERE player_id = p_id
  ), streaks AS (
    SELECT day, row_number() OVER (PARTITION BY day - day_number::integer ORDER BY day) AS streak_position FROM numbered
  )
  SELECT c.day FROM streaks c
  WHERE c.streak_position % 7 = 0
    AND NOT EXISTS (SELECT 1 FROM public.daily_challenges a WHERE a.player_id = p_id AND a.milestone_day = c.day)
  ORDER BY c.day;
$$;
REVOKE ALL ON FUNCTION public.daily_available_challenges(uuid) FROM PUBLIC;

CREATE FUNCTION public.daily_challenge_status(p_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE p_id uuid; available integer;
BEGIN
  SELECT s.player_id INTO p_id FROM public.daily_sessions s JOIN public.daily_players p ON p.id = s.player_id WHERE s.token_hash = encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND s.expires_at > now() AND NOT p.blocked;
  IF p_id IS NULL THEN RAISE EXCEPTION 'session_expired'; END IF;
  SELECT count(*) INTO available FROM public.daily_available_challenges(p_id);
  RETURN jsonb_build_object('available', available);
END $$;
REVOKE ALL ON FUNCTION public.daily_challenge_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_challenge_status(text) TO anon, authenticated;

CREATE FUNCTION public.daily_challenge(p_token text, p_target_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE attacker public.daily_players; victim public.daily_players; earned_day date; s public.daily_settings; d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT p.* INTO attacker FROM public.daily_players p JOIN public.daily_sessions x ON x.player_id=p.id WHERE x.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') AND x.expires_at > now() FOR UPDATE OF p;
  IF NOT FOUND OR attacker.blocked THEN RAISE EXCEPTION 'session_expired'; END IF;
  SELECT * INTO s FROM public.daily_settings WHERE id=1;
  IF NOT s.is_open OR d<s.start_date OR d>s.end_date THEN RAISE EXCEPTION 'game_closed'; END IF;
  SELECT m.milestone_day INTO earned_day FROM public.daily_available_challenges(attacker.id) m LIMIT 1;
  IF earned_day IS NULL THEN RAISE EXCEPTION 'challenge_unavailable'; END IF;
  IF p_target_id IS NULL OR p_target_id = attacker.id THEN RAISE EXCEPTION 'invalid_target'; END IF;
  SELECT * INTO victim FROM public.daily_players WHERE id=p_target_id FOR UPDATE;
  IF NOT FOUND OR victim.blocked THEN RAISE EXCEPTION 'invalid_target'; END IF;
  IF victim.coins < 5 THEN RAISE EXCEPTION 'target_insufficient_coins'; END IF;
  UPDATE public.daily_players SET coins=coins-5 WHERE id=victim.id;
  INSERT INTO public.daily_challenges(player_id,target_id,milestone_day,coins_taken) VALUES(attacker.id,victim.id,earned_day,5);
  RETURN jsonb_build_object('target_name',victim.name,'coins_taken',5);
END $$;
REVOKE ALL ON FUNCTION public.daily_challenge(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_challenge(text,uuid) TO anon, authenticated;