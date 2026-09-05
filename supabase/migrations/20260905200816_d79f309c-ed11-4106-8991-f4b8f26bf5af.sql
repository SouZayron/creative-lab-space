CREATE TABLE public.balao_settings (
  id integer PRIMARY KEY DEFAULT 1,
  is_open boolean NOT NULL DEFAULT true,
  signups_locked boolean NOT NULL DEFAULT false,
  max_pops_per_day integer NOT NULL DEFAULT 3,
  start_date date NOT NULL DEFAULT '2026-09-05',
  end_date date NOT NULL DEFAULT '2026-09-30',
  rules_text text NOT NULL DEFAULT '',
  prizes jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balao_settings TO anon, authenticated;
GRANT ALL ON public.balao_settings TO service_role;
ALTER TABLE public.balao_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balao_settings_read" ON public.balao_settings FOR SELECT USING (true);
CREATE POLICY "balao_settings_write" ON public.balao_settings FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.balao_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  password text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  last_play_date date,
  pops_today integer NOT NULL DEFAULT 0,
  pops_date date,
  tz text NOT NULL DEFAULT 'America/Sao_Paulo',
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX balao_users_name_key ON public.balao_users (lower(name));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balao_users TO anon, authenticated;
GRANT ALL ON public.balao_users TO service_role;
ALTER TABLE public.balao_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balao_users_read" ON public.balao_users FOR SELECT USING (true);
CREATE POLICY "balao_users_update" ON public.balao_users FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "balao_users_delete" ON public.balao_users FOR DELETE USING (true);

CREATE TABLE public.balao_balloons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value integer NOT NULL,
  weight numeric NOT NULL DEFAULT 1,
  color text NOT NULL DEFAULT 'c1',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balao_balloons TO anon, authenticated;
GRANT ALL ON public.balao_balloons TO service_role;
ALTER TABLE public.balao_balloons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balao_balloons_read" ON public.balao_balloons FOR SELECT USING (true);
CREATE POLICY "balao_balloons_write" ON public.balao_balloons FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.balao_streak_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  days integer NOT NULL,
  bonus_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balao_streak_rules TO anon, authenticated;
GRANT ALL ON public.balao_streak_rules TO service_role;
ALTER TABLE public.balao_streak_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balao_streak_read" ON public.balao_streak_rules FOR SELECT USING (true);
CREATE POLICY "balao_streak_write" ON public.balao_streak_rules FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.balao_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  points integer NOT NULL,
  base_points integer NOT NULL DEFAULT 0,
  bonus integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.balao_logs TO anon, authenticated;
GRANT ALL ON public.balao_logs TO service_role;
ALTER TABLE public.balao_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "balao_logs_read" ON public.balao_logs FOR SELECT USING (true);
CREATE POLICY "balao_logs_delete" ON public.balao_logs FOR DELETE USING (true);

CREATE TRIGGER balao_users_updated BEFORE UPDATE ON public.balao_users
FOR EACH ROW EXECUTE FUNCTION public.altavibe_touch_updated_at();

INSERT INTO public.balao_settings (id, rules_text, prizes) VALUES (
  1,
  E'Ranking: quem terminar com MAIS pontos leva os prêmios.\nPeríodo: 05/09/2026 a 30/09/2026.\nVocê tem 3 balões por dia, renovados após 00h.\nUse sempre o mesmo nome e senha de 4 dígitos.\nStreaks aplicam bônus percentual na pontuação.\nCadastros duplicados são desclassificados.\nÉ necessário estar ativo no xat.com/altavibe & IMVU.',
  '[{"icon":"🥇","label":"NAMEFLAG"},{"icon":"🎖️","label":"ANGRY"},{"icon":"😎","label":"ROMANCE"},{"icon":"🎗️","label":"30 DAYS"},{"icon":"🎗️","label":"15 DAYS"}]'::jsonb
);

INSERT INTO public.balao_balloons (value, weight, color, position) VALUES
 (1000, 5, 'c2', 0),
 (750, 8, 'c2', 1),
 (500, 10, 'c4', 2),
 (300, 12, 'c4', 3),
 (200, 15, 'c5', 4),
 (100, 20, 'c5', 5),
 (50, 25, 'c1', 6),
 (-50, 3, 'c3', 7),
 (-100, 2, 'c3', 8);

INSERT INTO public.balao_streak_rules (days, bonus_pct) VALUES (3,3),(5,6),(10,10),(15,15),(20,20);

CREATE OR REPLACE FUNCTION public.balao_login(p_name text, p_password text)
RETURNS public.balao_users
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  u public.balao_users;
  cleaned text;
  s public.balao_settings;
BEGIN
  cleaned := trim(p_name);
  IF cleaned IS NULL OR length(cleaned) < 2 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF p_password IS NULL OR p_password !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'invalid_password'; END IF;

  SELECT * INTO s FROM public.balao_settings WHERE id = 1;
  SELECT * INTO u FROM public.balao_users WHERE lower(name) = lower(cleaned) LIMIT 1;
  IF NOT FOUND THEN
    IF COALESCE(s.signups_locked, false) THEN RAISE EXCEPTION 'signups_locked'; END IF;
    INSERT INTO public.balao_users(name, password) VALUES (cleaned, p_password) RETURNING * INTO u;
  ELSE
    IF u.password <> p_password THEN RAISE EXCEPTION 'wrong_password'; END IF;
  END IF;
  RETURN u;
END;
$$;

CREATE OR REPLACE FUNCTION public.balao_pop(p_name text, p_tz text DEFAULT 'America/Sao_Paulo')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  u public.balao_users;
  s public.balao_settings;
  v_tz text;
  now_local timestamp;
  today date;
  total_w numeric := 0;
  r numeric;
  cum numeric := 0;
  b record;
  chosen public.balao_balloons;
  base_points integer := 0;
  pct numeric := 0;
  bonus integer := 0;
  total integer := 0;
  used integer;
  first_of_day boolean := false;
  new_streak integer;
BEGIN
  SELECT * INTO u FROM public.balao_users WHERE lower(name) = lower(trim(p_name)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_user'; END IF;
  IF u.blocked THEN RAISE EXCEPTION 'blocked'; END IF;

  v_tz := COALESCE(NULLIF(trim(p_tz), ''), u.tz, 'America/Sao_Paulo');
  BEGIN
    PERFORM now() AT TIME ZONE v_tz;
  EXCEPTION WHEN OTHERS THEN
    v_tz := 'America/Sao_Paulo';
  END;
  IF v_tz IS DISTINCT FROM u.tz THEN
    UPDATE public.balao_users SET tz = v_tz WHERE id = u.id;
  END IF;

  now_local := (now() AT TIME ZONE v_tz);
  today := now_local::date;

  SELECT * INTO s FROM public.balao_settings WHERE id = 1;
  IF NOT COALESCE(s.is_open, true) THEN RAISE EXCEPTION 'game_closed'; END IF;
  IF today < s.start_date THEN RAISE EXCEPTION 'game_not_started'; END IF;
  IF today > s.end_date THEN RAISE EXCEPTION 'game_ended'; END IF;

  IF u.pops_date IS DISTINCT FROM today THEN
    used := 0;
    first_of_day := true;
  ELSE
    used := COALESCE(u.pops_today, 0);
  END IF;
  IF used >= GREATEST(COALESCE(s.max_pops_per_day, 3), 1) THEN RAISE EXCEPTION 'no_pops_left'; END IF;

  SELECT COALESCE(sum(weight), 0) INTO total_w FROM public.balao_balloons WHERE weight > 0;
  IF total_w <= 0 THEN RAISE EXCEPTION 'no_balloons'; END IF;

  r := random() * total_w;
  FOR b IN SELECT * FROM public.balao_balloons WHERE weight > 0 ORDER BY position, created_at LOOP
    cum := cum + b.weight;
    IF r < cum THEN
      SELECT * INTO chosen FROM public.balao_balloons WHERE id = b.id;
      EXIT;
    END IF;
  END LOOP;
  IF chosen.id IS NULL THEN
    SELECT * INTO chosen FROM public.balao_balloons WHERE weight > 0 ORDER BY position LIMIT 1;
  END IF;

  base_points := chosen.value;

  IF first_of_day THEN
    IF u.last_play_date = today - 1 THEN new_streak := COALESCE(u.streak, 0) + 1;
    ELSE new_streak := 1; END IF;
  ELSE
    new_streak := GREATEST(COALESCE(u.streak, 1), 1);
  END IF;

  IF base_points > 0 THEN
    SELECT COALESCE(max(bonus_pct), 0) INTO pct FROM public.balao_streak_rules WHERE days <= new_streak;
    bonus := round(base_points * pct / 100.0);
  ELSE
    bonus := 0;
  END IF;
  total := base_points + bonus;

  UPDATE public.balao_users
  SET points = COALESCE(points, 0) + total,
      streak = new_streak,
      last_play_date = today,
      pops_date = today,
      pops_today = used + 1
  WHERE id = u.id
  RETURNING * INTO u;

  INSERT INTO public.balao_logs(user_id, name, points, base_points, bonus)
  VALUES (u.id, u.name, total, base_points, bonus);

  RETURN jsonb_build_object(
    'value', base_points,
    'bonus', bonus,
    'total', total,
    'color', chosen.color,
    'points', u.points,
    'streak', u.streak,
    'pops_today', u.pops_today,
    'pops_left', GREATEST(COALESCE(s.max_pops_per_day, 3), 1) - u.pops_today
  );
END;
$$;