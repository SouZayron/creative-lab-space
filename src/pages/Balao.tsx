import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeTables } from "@/hooks/useRealtimeTables";

interface BalaoUser {
  id: string;
  name: string;
  points: number;
  streak: number;
  pops_today: number;
  pops_date: string | null;
  blocked: boolean;
  tz: string;
}

interface Balloon {
  id: string;
  value: number;
  weight: number;
  color: string;
  position: number;
}

interface StreakRule {
  id: string;
  days: number;
  bonus_pct: number;
}

interface Settings {
  is_open: boolean;
  signups_locked: boolean;
  max_pops_per_day: number;
  start_date: string;
  end_date: string;
  rules_text: string;
  prizes: { icon: string; label: string }[];
}

interface LogRow {
  id: string;
  name: string;
  points: number;
  created_at: string;
}

const STORAGE_KEY = "balao:login";

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const safeDel = (k: string) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

// Cores apenas visuais — o valor do balão é sorteado no servidor e NÃO tem
// vínculo com a cor exibida. Cada balão recebe uma cor aleatória.
const COLOR_MAP: Record<string, { body: string; shade: string; hi: string }> = {
  c1: { body: "#7a4de8", shade: "#4c23b8", hi: "rgba(255,255,255,.85)" },
  c2: { body: "#e8b93c", shade: "#a97a10", hi: "rgba(255,255,255,.85)" },
  c3: { body: "#e05252", shade: "#a32626", hi: "rgba(255,255,255,.85)" },
  c4: { body: "#e05a9b", shade: "#a32660", hi: "rgba(255,255,255,.85)" },
  c5: { body: "#3fa9e0", shade: "#1c6fa3", hi: "rgba(255,255,255,.85)" },
  c6: { body: "#43c98a", shade: "#1e8a58", hi: "rgba(255,255,255,.85)" },
  c7: { body: "#e07840", shade: "#a34a1c", hi: "rgba(255,255,255,.85)" },
};
const COLORS = Object.keys(COLOR_MAP);

interface FlyingBalloon {
  key: number;
  left: number;
  duration: number;
  color: string;
}

interface Fx {
  key: number;
  x: number;
  y: number;
  value: number;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_name: "Digite um nome válido.",
  invalid_password: "A senha precisa ter 4 dígitos numéricos.",
  wrong_password: "Senha incorreta para este nome.",
  signups_locked: "Os cadastros estão encerrados.",
  no_user: "Jogador não encontrado.",
  blocked: "Você foi desclassificado deste jogo.",
  game_closed: "O jogo está pausado no momento.",
  game_not_started: "O jogo ainda não começou.",
  game_ended: "A temporada foi encerrada.",
  no_pops_left: "Você já estourou todos os balões de hoje. Volte amanhã!",
  no_balloons: "Nenhum balão configurado.",
};

const parseError = (message: string) => {
  const key = Object.keys(ERROR_MESSAGES).find((k) => message.includes(k));
  return key ? ERROR_MESSAGES[key] : "Não foi possível completar a ação.";
};

const Panel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div
    className={`rounded-xl border border-purple-400/20 bg-[#17112a]/80 backdrop-blur-xl p-3.5 shadow-[0_8px_22px_rgba(0,0,0,.35)] ${className}`}
  >
    {children}
  </div>
);

const PanelTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-purple-200/60">
    <span className="w-1.5 h-1.5 rounded-full bg-[#9b5cff] shadow-[0_0_8px_#9b5cff]" />
    {children}
  </div>
);

const Balao = () => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<BalaoUser | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [streakRules, setStreakRules] = useState<StreakRule[]>([]);
  const [ranking, setRanking] = useState<BalaoUser[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [flying, setFlying] = useState<FlyingBalloon[]>([]);
  const [fx, setFx] = useState<Fx[]>([]);
  const [result, setResult] = useState<string>("Seu resultado aparece aqui");
  const [busy, setBusy] = useState(false);
  const skyRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef(0);
  const poppedRef = useRef<Set<number>>(new Set());

  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    } catch {
      return "America/Sao_Paulo";
    }
  }, []);

  const fetchAll = useCallback(async () => {
    const [s, b, sr, u, l] = await Promise.all([
      supabase.from("balao_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("balao_balloons").select("*").order("position"),
      supabase.from("balao_streak_rules").select("*").order("days"),
      supabase.from("balao_users").select("*").order("points", { ascending: false }),
      supabase.from("balao_logs").select("*").order("created_at", { ascending: false }).limit(40),
    ]);
    if (s.data) {
      const raw = s.data as unknown as Settings & { prizes: unknown };
      setSettings({ ...raw, prizes: Array.isArray(raw.prizes) ? (raw.prizes as Settings["prizes"]) : [] });
    }
    setBalloons((b.data || []) as Balloon[]);
    setStreakRules((sr.data || []) as StreakRule[]);
    const users = ((u.data || []) as unknown as BalaoUser[]).filter((x) => !x.blocked);
    setRanking(users);
    setLogs((l.data || []) as LogRow[]);
    setUser((prev) => {
      if (!prev) return prev;
      const fresh = ((u.data || []) as unknown as BalaoUser[]).find((x) => x.id === prev.id);
      return fresh ?? prev;
    });
  }, []);

  useRealtimeTables({
    channelName: "balao-public",
    onSync: fetchAll,
    fallbackMs: 4000,
    tables: ["balao_users", "balao_logs", "balao_settings", "balao_balloons", "balao_streak_rules"],
  });

  // auto login
  useEffect(() => {
    const raw = safeGet(STORAGE_KEY);
    if (!raw) return;
    try {
      const { name: n, password: p } = JSON.parse(raw);
      if (n && p) void doLogin(n, p, true);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLogin = async (n: string, p: string, silent = false) => {
    const { data, error } = await supabase.rpc("balao_login", { p_name: n.trim(), p_password: p.trim() });
    if (error) {
      if (!silent) toast({ title: parseError(error.message), variant: "destructive" });
      return;
    }
    const u = data as unknown as BalaoUser;
    setUser(u);
    safeSet(STORAGE_KEY, JSON.stringify({ name: u.name, password: p.trim() }));
    void fetchAll();
  };

  const handleLogin = async () => {
    if (name.trim().length < 2) {
      toast({ title: "Digite um nome válido.", variant: "destructive" });
      return;
    }
    if (!/^\d{4}$/.test(password.trim())) {
      toast({ title: "A senha precisa ter 4 dígitos numéricos.", variant: "destructive" });
      return;
    }
    setBusy(true);
    await doLogin(name, password);
    setBusy(false);
  };

  const handleLogout = () => {
    setUser(null);
    safeDel(STORAGE_KEY);
    setResult("Seu resultado aparece aqui");
  };

  // spawn balloons
  useEffect(() => {
    if (!user) {
      setFlying([]);
      return;
    }
    const spawn = () => {
      keyRef.current += 1;
      const key = keyRef.current;
      const duration = 8 + Math.random() * 5;
      setFlying((prev) => [
        ...prev.slice(-14),
        { key, left: 4 + Math.random() * 84, duration, color: COLORS[Math.floor(Math.random() * COLORS.length)] },
      ]);
      window.setTimeout(() => {
        setFlying((prev) => prev.filter((f) => f.key !== key));
        poppedRef.current.delete(key);
      }, duration * 1000);
    };
    for (let i = 0; i < 5; i++) window.setTimeout(spawn, i * 450);
    const id = window.setInterval(spawn, 1300);
    return () => window.clearInterval(id);
  }, [user]);

  const maxPops = settings?.max_pops_per_day ?? 3;
  const todayPops = user?.pops_today ?? 0;
  const popsLeft = Math.max(maxPops - todayPops, 0);

  const handlePop = async (fb: FlyingBalloon, e: React.MouseEvent) => {
    if (!user || busy) return;
    if (poppedRef.current.has(fb.key)) return;
    poppedRef.current.add(fb.key);
    setBusy(true);

    const skyRect = skyRef.current?.getBoundingClientRect();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = skyRect ? rect.left - skyRect.left + rect.width / 2 : 0;
    const y = skyRect ? rect.top - skyRect.top + rect.height / 2 : 0;

    const { data, error } = await supabase.rpc("balao_pop", { p_name: user.name, p_tz: tz });
    setBusy(false);
    if (error) {
      poppedRef.current.delete(fb.key);
      setResult(parseError(error.message));
      toast({ title: parseError(error.message), variant: "destructive" });
      return;
    }
    const res = data as unknown as {
      value: number;
      bonus: number;
      total: number;
      points: number;
      streak: number;
      pops_today: number;
    };

    setFlying((prev) => prev.filter((f) => f.key !== fb.key));
    keyRef.current += 1;
    const fxKey = keyRef.current;
    setFx((prev) => [...prev, { key: fxKey, x, y, value: res.total }]);
    window.setTimeout(() => setFx((prev) => prev.filter((f) => f.key !== fxKey)), 950);

    setUser((prev) =>
      prev ? { ...prev, points: res.points, streak: res.streak, pops_today: res.pops_today } : prev,
    );
    setResult(
      `Balão estourado: ${res.total > 0 ? "+" : ""}${res.total} pontos${
        res.bonus !== 0 ? ` (streak +${res.bonus})` : ""
      }`,
    );
    void fetchAll();
  };

  const totalWeight = balloons.reduce((s, b) => s + Number(b.weight), 0) || 1;

  const closed = settings && !settings.is_open;

  return (
    <div className="h-screen overflow-hidden text-[#efeaf9] bg-[linear-gradient(180deg,#0c0817,#150f26_60%,#0a0713)]">
      <Helmet>
        <title>Estoura Balão | LabXat</title>
        <meta name="description" content="Estoura Balão — jogue todo dia, acumule pontos e dispute os prêmios da temporada." />
      </Helmet>
      <style>{`
        @keyframes balao-rise { from { transform: translateY(0); } to { transform: translateY(calc(-100vh - 240px)); } }
        @keyframes balao-sway { 0%,100% { transform: translateX(0) rotate(-2.5deg); } 50% { transform: translateX(14px) rotate(2.5deg); } }
        @keyframes balao-burst { to { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; } }
        @keyframes balao-float { 0%{transform:translate(-50%,-50%) scale(.6);opacity:0} 20%{transform:translate(-50%,-60%) scale(1.15);opacity:1} 100%{transform:translate(-50%,-140%) scale(1);opacity:0} }
      `}</style>

      <div className="mx-auto h-screen max-w-[1600px] p-3 grid gap-3 grid-cols-1 lg:grid-cols-[300px_1fr_300px] overflow-hidden">
        {/* LEFT */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel className="shrink-0">
            <PanelTitle>SEU PERFIL</PanelTitle>
            {!user ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-purple-200/50 tracking-wide">NOME</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={18}
                    placeholder="Ex: DjVibeKing"
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-[#9b5cff]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-purple-200/50 tracking-wide">SENHA (4 DÍGITOS)</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="• • • •"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-sm tracking-[0.35em] outline-none focus:border-[#9b5cff]"
                  />
                </div>
                <button
                  onClick={handleLogin}
                  disabled={busy}
                  className="w-full rounded-lg py-2.5 text-[12.5px] font-bold text-white bg-gradient-to-br from-[#9b5cff] to-[#6a3dd8] shadow-[0_6px_16px_rgba(155,92,255,.32)] disabled:opacity-60"
                >
                  ENTRAR
                </button>
                <div className="flex gap-1.5 rounded-lg border border-[#ffcf5c]/30 bg-[#ffcf5c]/10 px-2.5 py-2 text-[10.5px] leading-relaxed text-[#f4dfa0]">
                  🎈{" "}
                  <span>
                    <b className="text-white">Novo por aqui?</b> Nome + senha de 4 dígitos criam seu cadastro
                    automaticamente.
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                <div>
                  <div className="text-[13px] font-bold">{user.name}</div>
                  <div className="text-[10.5px] text-purple-200/40">
                    {user.points} pontos · streak {user.streak} dias
                  </div>
                </div>
                <button onClick={handleLogout} className="text-[10.5px] underline text-purple-200/40">
                  sair
                </button>
              </div>
            )}
          </Panel>

          <Panel className="shrink-0">
            <PanelTitle>PRÊMIOS DA TEMPORADA</PanelTitle>
            <div className="grid grid-cols-5 gap-1.5">
              {(settings?.prizes || []).map((p, i) => (
                <div
                  key={i}
                  className={`rounded-lg bg-black/25 border px-0.5 pt-1.5 pb-1.5 text-center ${
                    i === 0 ? "border-[#ffcf5c]/40" : "border-white/10"
                  }`}
                >
                  <div className="text-base">{p.icon}</div>
                  <div className="text-[8px] text-purple-200/40 mt-0.5">{p.label}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="flex-1 min-h-0 overflow-hidden">
            <PanelTitle>REGRAS</PanelTitle>
            <div className="h-full overflow-y-auto text-[10.8px] leading-relaxed text-purple-200/70 whitespace-pre-line pr-1">
              {settings?.rules_text}
            </div>
          </Panel>
        </div>

        {/* CENTER */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel className="flex-1 min-h-[420px] flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold tracking-[0.06em] text-purple-200/60">🎈 ESTOURA BALÃO</div>
              <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-purple-200/60">
                {user ? (
                  <>
                    Balões de hoje: <b className="text-[#ffcf5c]">{popsLeft}</b>/{maxPops}
                  </>
                ) : (
                  "Faça login para jogar"
                )}
              </div>
            </div>

            <div
              ref={skyRef}
              className="relative flex-1 min-h-[320px] rounded-xl overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_50%_15%,rgba(155,92,255,.16),transparent_55%),linear-gradient(180deg,#120c22,#0b0716_85%)]"
            >
              {closed && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm text-center px-6">
                  <p className="text-lg font-bold text-[#ffcf5c]">Jogo pausado pelo administrador.</p>
                </div>
              )}
              {flying.map((f) => {
                const c = COLOR_MAP[f.color];
                return (
                  <div
                    key={f.key}
                    onClick={(e) => handlePop(f, e)}
                    className="absolute cursor-pointer w-[64px] h-[96px] transition-transform hover:scale-110"
                    style={{
                      left: `${f.left}%`,
                      bottom: "-170px",
                      animation: `balao-rise ${f.duration}s linear forwards`,
                      filter: "drop-shadow(0 10px 18px rgba(0,0,0,.45))",
                    }}
                  >
                    <div
                      className="w-full h-full"
                      style={{ animation: `balao-sway ${2.4 + (f.key % 5) * 0.35}s ease-in-out infinite` }}
                    >
                      <svg viewBox="0 0 64 96" className="w-full h-full">
                        <defs>
                          <radialGradient id={`bg-${f.key}`} cx="34%" cy="28%" r="75%">
                            <stop offset="0%" stopColor={c.hi} stopOpacity="0.9" />
                            <stop offset="28%" stopColor={c.body} />
                            <stop offset="100%" stopColor={c.shade} />
                          </radialGradient>
                        </defs>
                        {/* corpo */}
                        <path
                          d="M32 4 C14 4 4 20 4 36 C4 54 20 68 32 74 C44 68 60 54 60 36 C60 20 50 4 32 4 Z"
                          fill={`url(#bg-${f.key})`}
                        />
                        {/* brilho */}
                        <ellipse cx="21" cy="24" rx="7" ry="12" fill="rgba(255,255,255,.35)" transform="rotate(-18 21 24)" />
                        {/* nó */}
                        <path d="M28 74 L32 82 L36 74 Z" fill={c.shade} />
                        {/* barbante */}
                        <path
                          d="M32 82 C30 86 34 88 32 92 C31 94 33 95 32 96"
                          stroke="rgba(255,255,255,.4)"
                          strokeWidth="1.4"
                          fill="none"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                );
              })}
              {fx.map((f) => (
                <div
                  key={f.key}
                  className="pointer-events-none absolute w-[90px] h-[90px] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: f.x, top: f.y }}
                >
                  {Array.from({ length: 10 }).map((_, i) => {
                    const angle = (Math.PI * 2 * i) / 10;
                    const dist = 28 + Math.random() * 18;
                    return (
                      <span
                        key={i}
                        className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
                        style={{
                          background: f.value < 0 ? "#ff5c6a" : "#ffcf5c",
                          ["--dx" as string]: `${Math.cos(angle) * dist}px`,
                          ["--dy" as string]: `${Math.sin(angle) * dist}px`,
                          animation: "balao-burst .55s ease-out forwards",
                        }}
                      />
                    );
                  })}
                  <div
                    className="absolute left-1/2 top-1/2 text-[17px] font-extrabold whitespace-nowrap"
                    style={{ color: f.value < 0 ? "#ff5c6a" : "#ffcf5c", animation: "balao-float .9s ease-out forwards" }}
                  >
                    {f.value > 0 ? "+" : ""}
                    {f.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-center text-xs text-purple-200/60">
              {result}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>PESO DOS BALÕES E STREAK</PanelTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                {[...balloons]
                  .sort((a, b) => b.value - a.value)
                  .map((b) => (
                    <div
                      key={b.id}
                      className="flex justify-between items-center py-1 text-[11px] border-b border-white/5 last:border-0"
                    >
                      <span className={b.value < 0 ? "text-[#ff5c6a]" : "text-purple-200/70"}>
                        {b.value > 0 ? "+" : ""}
                        {b.value} pontos
                      </span>
                      <span className={`font-bold ${b.value < 0 ? "text-[#ff5c6a]" : "text-[#ffcf5c]"}`}>
                        {((Number(b.weight) / totalWeight) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </div>
              <div>
                {streakRules.map((s) => (
                  <div
                    key={s.id}
                    className="mb-1.5 flex justify-between items-center rounded-md border border-white/10 bg-black/20 px-2.5 py-1.5 text-[10.8px]"
                  >
                    <span>{s.days}+ dias seguidos</span>
                    <span className="font-bold text-[#ffcf5c]">+{Number(s.bonus_pct)}% nos pontos</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel className="flex-[1.3] min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] font-semibold tracking-[0.06em] text-purple-200/60">🏆 RANKING</div>
              <div className="text-[10px] text-purple-200/40">{ranking.length} players</div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {ranking.length === 0 && <p className="text-[11px] text-purple-200/40">Ninguém jogou ainda.</p>}
              {ranking.map((u, i) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2 px-1 py-1.5 border-b border-white/5 last:border-0 ${
                    user && u.id === user.id ? "rounded-md bg-[#9b5cff]/10" : ""
                  }`}
                >
                  <span
                    className={`w-[18px] text-center text-xs font-extrabold ${
                      i === 0 ? "text-[#ffcf5c]" : i === 1 ? "text-[#d5d5e6]" : i === 2 ? "text-[#d9975a]" : "text-purple-200/40"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-xs font-semibold truncate">{u.name}</span>
                  <span className="text-[9.5px] text-purple-200/40">
                    {u.pops_today}/{maxPops} hoje
                  </span>
                  <span className="text-xs font-extrabold text-[#ffcf5c]">{u.points}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="flex-1 min-h-0 flex flex-col">
            <PanelTitle>LOGS (TEMPO REAL)</PanelTitle>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {logs.length === 0 && <p className="text-[11px] text-purple-200/40">Sem estouros ainda.</p>}
              {logs.map((l) => (
                <div key={l.id} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0 text-[11px]">
                  <span>
                    <span className="font-semibold">{l.name}</span>
                    <span className="ml-1.5 text-[9.5px] text-purple-200/40">
                      {new Date(l.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className={`font-bold ${l.points < 0 ? "text-[#ff5c6a]" : "text-[#ffcf5c]"}`}>
                    {l.points > 0 ? "+" : ""}
                    {l.points} pts
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default Balao;
