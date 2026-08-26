CREATE TABLE public.cartelas_event (
  id integer PRIMARY KEY DEFAULT 1,
  event_name text NOT NULL DEFAULT '',
  total_cards integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.cartelas_event TO anon;
GRANT SELECT, INSERT, UPDATE ON public.cartelas_event TO authenticated;
GRANT ALL ON public.cartelas_event TO service_role;

ALTER TABLE public.cartelas_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cartelas event" ON public.cartelas_event FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cartelas event" ON public.cartelas_event FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cartelas event" ON public.cartelas_event FOR UPDATE USING (true) WITH CHECK (true);

INSERT INTO public.cartelas_event (id, event_name, total_cards, is_active)
VALUES (1, '', 0, false) ON CONFLICT (id) DO NOTHING;