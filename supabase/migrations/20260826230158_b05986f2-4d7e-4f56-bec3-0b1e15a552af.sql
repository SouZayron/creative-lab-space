CREATE OR REPLACE FUNCTION public.bingo_cards_keep_player_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.player_name IS NULL AND OLD.player_name IS NOT NULL THEN
    NEW.player_name := OLD.player_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bingo_cards_keep_player_name ON public.bingo_cards;
CREATE TRIGGER trg_bingo_cards_keep_player_name
BEFORE UPDATE ON public.bingo_cards
FOR EACH ROW EXECUTE FUNCTION public.bingo_cards_keep_player_name();