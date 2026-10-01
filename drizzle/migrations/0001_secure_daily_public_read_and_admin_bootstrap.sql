ALTER TABLE public.daily_players ENABLE ROW LEVEL SECURITY;
REVOKE SELECT ON public.daily_players FROM anon, authenticated;
GRANT SELECT (id,name,coins,blocked,created_at) ON public.daily_players TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.daily_claim_admin() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'login_required'; END IF; PERFORM pg_advisory_xact_lock(20261001); IF EXISTS (SELECT 1 FROM public.daily_admin_roles) THEN RETURN public.daily_is_admin(); END IF; INSERT INTO public.daily_admin_roles(user_id,role) VALUES (auth.uid(),'admin'); RETURN true; END $$;
REVOKE ALL ON FUNCTION public.daily_claim_admin() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.daily_claim_admin() TO authenticated;
CREATE OR REPLACE FUNCTION public.daily_logout(p_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN DELETE FROM public.daily_sessions WHERE token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex'); END $$;
REVOKE ALL ON FUNCTION public.daily_logout(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.daily_logout(text) TO anon, authenticated;