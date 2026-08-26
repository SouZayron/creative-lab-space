ALTER TABLE public.cartelas_event REPLICA IDENTITY FULL;
ALTER TABLE public.bingo_cards REPLICA IDENTITY FULL;
ALTER TABLE public.game_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.game_picks REPLICA IDENTITY FULL;
ALTER TABLE public.game_players REPLICA IDENTITY FULL;
ALTER TABLE public.bomba_state REPLICA IDENTITY FULL;
ALTER TABLE public.bomba_picks REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='cartelas_event') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cartelas_event;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bingo_cards') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bingo_cards;
  END IF;
END $$;