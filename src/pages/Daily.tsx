import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, RotateCw, Trophy, LogOut, Coins, ChevronLeft, ChevronRight } from "lucide-react";
import { useRealtimeTables } from "@/hooks/useRealtimeTables";

type Player = { id: string; name: string; coins: number; blocked: boolean };
type Segment = { label: string; value: number; weight: number };
type Settings = { is_open: boolean; signups_open: boolean; wheel_open: boolean; start_date: string; end_date: string; welcome_coins: number; spin_cost: number; wheel_segments: Segment[] };
type Checkin = { day: string; coins: number; player_id: string };
const KEY = "vibe_daily_session";
const messageFor = (raw: string) => {
  const messages: Record<string,string> = { invalid_name: "Nome deve ter entre 3 e 20 caracteres.", invalid_password: "Senha deve ter entre 4 e 72 caracteres.", wrong_password: "Senha incorreta para este nome.", signups_closed: "Cadastros encerrados.", blocked: "Conta bloqueada.", session_expired: "Sessão encerrada. Entre novamente.", already_claimed: "Check-in de hoje já realizado.", game_closed: "Jogo indisponível no momento.", insufficient_coins: "VibeCoins insuficientes.", invalid_wheel: "Roleta indisponível." };
  return Object.entries(messages).find(([key]) => raw.includes(key))?.[1] ?? "Não foi possível concluir. Tente novamente.";
};
const getToken = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const saveToken = (value: string) => { try { if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY); } catch { /* private browser */ } };
const todaySaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const weekdays = ["Qui", "Sex", "Sáb", "Dom", "Seg", "Ter", "Qua"];

export default function Daily() {
  const [token, setToken] = useState(getToken);
  const [player, setPlayer] = useState<Player | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [checks, setChecks] = useState<Checkin[]>([]);
  const [ranking, setRanking] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"calendar" | "wheel" | "ranking">("calendar");
  const [week, setWeek] = useState(() => todaySaoPaulo().slice(0, 7) === "2026-10" ? Math.ceil(Number(todaySaoPaulo().slice(-2)) / 7) : 1);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(todaySaoPaulo);
  const sync = useCallback(async () => {
    const [s,c,r] = await Promise.all([
      supabase.from("daily_settings").select("*").eq("id",1).maybeSingle(),
      supabase.from("daily_checkins").select("player_id,day,coins"),
      supabase.from("daily_players").select("id,name,coins,blocked").order("coins", { ascending: false }).limit(5),
    ]);
    if (s.data) setSettings(s.data as unknown as Settings);
    if (c.data) setChecks(c.data as Checkin[]);
    if (r.data) setRanking(r.data as Player[]);
  }, []);
  useRealtimeTables({ channelName: "daily-public", tables: ["daily_settings","daily_checkins","daily_players"], fallbackMs: 6000, onSync: sync });
  useEffect(() => { const timer = window.setInterval(() => setClock(todaySaoPaulo()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!token) return; let mounted = true; const refresh = async () => { const {data,error} = await supabase.rpc("daily_current", {p_token:token}); if (!mounted) return; if (error) { saveToken(""); setToken(""); setPlayer(null); } else setPlayer(data as Player); }; void refresh(); const timer = window.setInterval(refresh, 15000); return () => { mounted = false; window.clearInterval(timer); }; }, [token]);
  const days = useMemo(() => new Set(checks.filter(c => c.player_id === player?.id).map(c => c.day)), [checks,player?.id]);
  const today = Number(clock.slice(-2));
  const active = Boolean(settings?.is_open && clock >= settings.start_date && clock <= settings.end_date);
  const claimed = days.has(clock);
  const month = settings?.start_date.slice(0,7) ?? "2026-10";
  const totalDays = new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const start = (week-1)*7+1;
  const logout = async () => { if (token) await supabase.rpc("daily_logout",{p_token:token}); saveToken(""); setToken(""); setPlayer(null); setNotice(""); };
  const login = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; setBusy(true); const {data,error} = await supabase.rpc("daily_access",{p_name:name.trim(),p_password:password}); setBusy(false); if (error) { setNotice(messageFor(error.message)); return; } const response = data as {token:string;player:Player}; saveToken(response.token); setToken(response.token); setPlayer(response.player); setPassword(""); setNotice(""); void sync(); };
  const claim = async () => { if (busy || !token) return; setBusy(true); const {data,error} = await supabase.rpc("daily_claim",{p_token:token}); setBusy(false); if (error) { setNotice(messageFor(error.message)); } else { const result = data as { reward:number;player:Player }; setPlayer(result.player); setNotice(`+${result.reward} VibeCoins recebidos!`); void sync(); } };
  const spin = async () => { if (spinning || !token || !settings) return; setSpinning(true); setNotice("Girando…"); const {data,error} = await supabase.rpc("daily_spin",{p_token:token}); if (error) { setNotice(messageFor(error.message)); setSpinning(false); return; } const result = data as { value:number;player:Player }; const index = settings.wheel_segments.findIndex(s => s.value === result.value); const target = Math.max(0,index); const next = rotation + 1800 + ((360 - ((rotation + 1800) % 360) - (target*60+30) + 360) % 360); setRotation(next); window.setTimeout(() => { setPlayer(result.player); setSpinning(false); setNotice(result.value === -1 ? "🔁 Giro devolvido!" : result.value === 0 ? "💨 Nada dessa vez!" : `+${result.value} VibeCoins!`); void sync(); }, 4300); };
  return <main className="zgames-page min-h-screen px-4 py-8 text-foreground"><Helmet><title>Vibe Check-in · Outubro | LabXat</title><meta name="description" content="Faça check-in diário, gire a roleta e acompanhe o Top 5 de VibeCoins." /></Helmet>
    <div className="mx-auto max-w-5xl"><div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-secondary">RÁDIO ALTA VIBE · OUTUBRO 2026</p><h1 className="zgames-heading text-3xl font-bold sm:text-4xl">Vibe Check-in</h1></div>{player && <Button variant="ghost" onClick={logout}><LogOut /> Sair de {player.name}</Button>}</div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]"><section className="zgames-glass overflow-hidden rounded-lg"><div className="flex items-center justify-between border-b border-border bg-primary/15 px-6 py-6"><div><p className="text-sm text-muted-foreground">SALDO DE {player?.name ?? "VIBECOINS"}</p><div className="flex items-baseline gap-2"><strong className="text-5xl">{player?.coins ?? 0}</strong><span className="text-sm text-muted-foreground">VibeCoins</span></div></div><Coins className="size-9 text-secondary" /></div>
    <div className="grid grid-cols-3 border-b border-border bg-card/30">{([["calendar",CalendarDays,"Check-in"],["wheel",RotateCw,"Roleta"],["ranking",Trophy,"Top 5"]] as const).map(([key,Icon,label]) => <Button key={key} type="button" variant="ghost" className={`h-14 rounded-none text-sm ${tab===key ? "border-b-2 border-primary bg-primary/15 text-foreground" : "text-muted-foreground"}`} onClick={() => {setTab(key);setNotice("");}}><Icon /> {label}</Button>)}</div>
    <div className="min-h-[355px] p-5 sm:p-7">{tab === "calendar" ? <><div className="mb-5 flex items-center justify-between"><Button variant="ghost" size="icon" aria-label="Semana anterior" disabled={week<=1} onClick={() => setWeek(w=>w-1)}><ChevronLeft /></Button><div className="text-center"><h2 className="font-semibold">Semana {week}</h2><p className="text-xs text-muted-foreground">Dias {start}–{Math.min(totalDays,start+6)} de outubro</p></div><Button variant="ghost" size="icon" aria-label="Próxima semana" disabled={start+6>=totalDays} onClick={() => setWeek(w=>w+1)}><ChevronRight /></Button></div><div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">{weekdays.map(w=><span key={w}>{w}</span>)}</div><div className="grid grid-cols-7 gap-2">{Array.from({length:Math.min(7,Math.max(0,totalDays-start+1))},(_,i)=>{ const day=start+i; const date=`${month}-${String(day).padStart(2,"0")}`; const done=days.has(date); return <div key={day} className={`flex aspect-[3/4] min-w-0 flex-col items-center justify-center rounded-md border text-sm ${done ? "border-primary bg-primary/30" : date===clock ? "border-secondary bg-secondary/20" : "border-border bg-card/50 text-muted-foreground"}`}><b className="text-lg">{day}</b><span className="text-xs">{done ? "✓" : date===clock ? "HOJE" : date<clock ? "✕" : "·"}</span></div>;})}</div><p className="mt-5 text-center text-sm text-muted-foreground">Cada check-in vale o número de VibeCoins do dia.</p><Button className="mt-4 w-full" disabled={!player || !active || claimed || busy} onClick={claim}>{claimed ? "✓ Check-in feito hoje" : active ? `Fazer check-in · +${today} VibeCoins` : "Fora do período do jogo"}</Button></> : tab === "wheel" ? <div className="flex flex-col items-center justify-center gap-6 py-2"><div className="relative size-52 sm:size-60"><div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 border-x-[10px] border-t-[20px] border-x-transparent border-t-secondary" /><div className="relative size-full rounded-full border-[6px] border-secondary shadow-neon transition-transform duration-[4200ms] ease-out" style={{transform:`rotate(${rotation}deg)`,background:"conic-gradient(hsl(var(--primary)) 0 60deg,hsl(var(--muted)) 60deg 120deg,hsl(var(--zgames-green)) 120deg 180deg,hsl(var(--muted)) 180deg 240deg,hsl(var(--secondary)) 240deg 300deg,hsl(var(--zgames-cyan)) 300deg 360deg)"}}>{settings?.wheel_segments.map((s,i)=><span key={i} className="absolute left-1/2 top-1/2 text-sm font-bold" style={{transform:`rotate(${i*60+30}deg) translateY(-77px) rotate(-${i*60+30}deg)`}}>{s.label}</span>)}</div><div className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card">🪙</div></div><Button className="w-full max-w-xs" onClick={spin} disabled={!player || !active || !settings?.wheel_open || spinning || (player?.coins ?? 0)<(settings?.spin_cost ?? 5)}>{spinning ? "Girando…" : `Girar · −${settings?.spin_cost ?? 5} VibeCoins`}</Button></div> : <div><h2 className="mb-5 text-xl font-semibold">🏆 Top 5</h2><div className="space-y-2">{ranking.length ? ranking.filter(p=>!p.blocked).map((p,i)=><div key={p.id} className="flex justify-between gap-3 rounded-md border border-border bg-card/50 p-3"><span>{["🥇","🥈","🥉","4º","5º"][i]} {p.name}</span><strong>{p.coins} 🪙</strong></div>) : <p className="text-muted-foreground">Ninguém participou ainda.</p>}</div></div>}{notice && <p role="status" className="mt-4 text-center text-sm text-secondary">{notice}</p>}</div></section>
    <aside className="space-y-5"><div className="zgames-glass rounded-lg p-6"><p className="mb-3 text-xs font-semibold text-secondary">OUTUBRO · 01—31</p><h2 className="text-xl font-semibold">Um dia, uma recompensa.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Dia 1 vale 1 VibeCoin. Dia 20 vale 20. Volte a cada dia para marcar sua presença.</p><div className="mt-5 flex justify-between border-t border-border pt-4 text-sm"><span className="text-muted-foreground">Seus check-ins</span><b>{days.size} / {totalDays}</b></div></div>{!player && <form onSubmit={login} className="zgames-glass space-y-4 rounded-lg p-6"><h2 className="text-xl font-semibold">Entrar no jogo</h2><Input aria-label="Seu nome" placeholder="Seu nome" value={name} onChange={e=>setName(e.target.value)} maxLength={20} autoComplete="username" required /><Input aria-label="Sua senha" type="password" placeholder="Sua senha" value={password} onChange={e=>setPassword(e.target.value)} maxLength={72} autoComplete="current-password" required /><Button disabled={busy} className="w-full" type="submit">{busy ? "Entrando…" : "Entrar ou criar conta"}</Button><p className="text-xs text-muted-foreground">Primeira vez? Seu nome e senha criam a conta e rendem {settings?.welcome_coins ?? 100} VibeCoins.</p></form>}</aside></div></div></main>;
}
