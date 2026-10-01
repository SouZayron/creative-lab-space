ALTER FUNCTION public.daily_access(text,text) SET search_path = public, extensions;
ALTER FUNCTION public.daily_current(text) SET search_path = public, extensions;
ALTER FUNCTION public.daily_claim(text) SET search_path = public, extensions;
ALTER FUNCTION public.daily_spin(text) SET search_path = public, extensions;
ALTER FUNCTION public.daily_logout(text) SET search_path = public, extensions;