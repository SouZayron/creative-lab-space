import { useCallback, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRealtimeTables } from "@/hooks/useRealtimeTables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Save, RotateCcw, Lock, Unlock, Play, Pause } from "lucide-react";

const ADMIN_PASSWORD = "admin2026";

interface Settings {
  id: number;
  is_open: boolean;
  signups_locked: boolean;
  max_pops_per_day: number;
  start_date: string;
  end_date: string;
  rules_text: string;
  prizes: { icon: string; label: string }[];
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

interface BalaoUser {
  id: string;
  name: string;
  password: string;
  points: number;
  streak: number;
  pops_today: number;
  pops_date: string | null;
  blocked: boolean;
  tz: string;
}

interface LogRow {
  id: string;
  name: string;
  points: number;
  base_points: number;
  bonus: number;
  created_at: string;
}

const Panel = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border border-purple-400/20 bg-[#17112a]/80 backdrop-blur-xl p-4 shadow-xl ${className}`}>
    <h3 className="mb-3 text-[11px] font-bold tracking-[0.08em] text-purple-200/70">{title}</h3>
    {children}
  </div>
);

const AdminBalao = () => {
  const { toast } = useToast();
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [balloons, setBalloons] = useState<Balloon[]>([]);
  const [rules, setRules] = useState<StreakRule[]>([]);
  const [users, setUsers] = useState<BalaoUser[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);

  // evita que a atualização automática sobrescreva o que o admin está digitando
  const dirtyRef = useRef(false);
  const isTyping = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
  };

  const fetchAll = useCallback(async () => {
    if (isTyping() || dirtyRef.current) return;
    const [s, b, r, u, l] = await Promise.all([
      supabase.from("balao_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("balao_balloons").select("*").order("position"),
      supabase.from("balao_streak_rules").select("*").order("days"),
      supabase.from("balao_users").select("*").order("points", { ascending: false }),
      supabase.from("balao_logs").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (s.data) {
      const raw = s.data as unknown as Settings;
      setSettings({ ...raw, prizes: Array.isArray(raw.prizes) ? raw.prizes : [] });
    }
    setBalloons((b.data || []) as Balloon[]);
    setRules((r.data || []) as StreakRule[]);
    setUsers((u.data || []) as unknown as BalaoUser[]);
    setLogs((l.data || []) as LogRow[]);
  }, []);


  useRealtimeTables({
    channelName: "balao-admin",
    enabled: authed,
    onSync: fetchAll,
    fallbackMs: 5000,
    tables: ["balao_users", "balao_logs", "balao_settings", "balao_balloons", "balao_streak_rules"],
  });

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase
      .from("balao_settings")
      .update({ ...patch, updated_at: new Date().toISOString() } as never)
      .eq("id", 1);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      dirtyRef.current = false;
      toast({ title: "Salvo!" });
    }
  };


  const patchUser = async (id: string, patch: Partial<BalaoUser>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    await supabase.from("balao_users").update(patch as never).eq("id", id);
  };

  const deleteUser = async (id: string) => {
    await supabase.from("balao_users").delete().eq("id", id);
    void fetchAll();
  };

  const resetSeason = async () => {
    if (!confirm("Zerar pontos, streaks e logs de todos os jogadores?")) return;
    await supabase.from("balao_users").update({ points: 0, streak: 0, pops_today: 0, pops_date: null, last_play_date: null } as never).neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("balao_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    void fetchAll();
    toast({ title: "Temporada reiniciada!" });
  };

  const resetDailyPops = async () => {
    await supabase.from("balao_users").update({ pops_today: 0, pops_date: null } as never).neq("id", "00000000-0000-0000-0000-000000000000");
    void fetchAll();
    toast({ title: "Balões diários liberados!" });
  };

  const clearLogs = async () => {
    await supabase.from("balao_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    void fetchAll();
  };

  const patchBalloon = async (id: string, patch: Partial<Balloon>) => {
    setBalloons((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    await supabase.from("balao_balloons").update(patch as never).eq("id", id);
  };

  const addBalloon = async () => {
    await supabase.from("balao_balloons").insert({ value: 10, weight: 5, color: "c1", position: balloons.length } as never);
    void fetchAll();
  };

  const removeBalloon = async (id: string) => {
    await supabase.from("balao_balloons").delete().eq("id", id);
    void fetchAll();
  };

  const patchRule = async (id: string, patch: Partial<StreakRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    await supabase.from("balao_streak_rules").update(patch as never).eq("id", id);
  };

  const addRule = async () => {
    await supabase.from("balao_streak_rules").insert({ days: 3, bonus_pct: 5 } as never);
    void fetchAll();
  };

  const removeRule = async (id: string) => {
    await supabase.from("balao_streak_rules").delete().eq("id", id);
    void fetchAll();
  };

  const setPrize = (i: number, field: "icon" | "label", value: string) => {
    if (!settings) return;
    const prizes = settings.prizes.map((p, idx) => (idx === i ? { ...p, [field]: value } : p));
    setSettings({ ...settings, prizes });
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[linear-gradient(180deg,#0c0817,#150f26_60%,#0a0713)] text-[#efeaf9] p-4">
        <Helmet>
          <title>Admin Estoura Balão | LabXat</title>
          <meta name="description" content="Painel administrativo do jogo Estoura Balão." />
        </Helmet>
        <div className="w-full max-w-sm rounded-xl border border-purple-400/20 bg-[#17112a]/80 p-6 backdrop-blur-xl">
          <h1 className="mb-4 text-lg font-bold">🎈 Painel Estoura Balão</h1>
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAuthed(pass === ADMIN_PASSWORD)}
            placeholder="Senha do admin"
            className="bg-black/30 border-white/10"
          />
          <Button
            className="mt-3 w-full bg-gradient-to-r from-[#9b5cff] to-[#6a3dd8]"
            onClick={() => {
              if (pass === ADMIN_PASSWORD) setAuthed(true);
              else toast({ title: "Senha incorreta", variant: "destructive" });
            }}
          >
            Entrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0c0817,#150f26_60%,#0a0713)] text-[#efeaf9] p-4">
      <Helmet>
        <title>Admin Estoura Balão | LabXat</title>
        <meta name="description" content="Painel administrativo do jogo Estoura Balão." />
      </Helmet>

      <div className="mx-auto max-w-[1600px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">🎈 Painel Estoura Balão</h1>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => saveSettings({ is_open: !settings?.is_open })} className={settings?.is_open ? "bg-green-600" : "bg-red-600"}>
              {settings?.is_open ? <><Pause className="w-4 h-4 mr-1" /> Pausar jogo</> : <><Play className="w-4 h-4 mr-1" /> Abrir jogo</>}
            </Button>
            <Button size="sm" variant="outline" className="border-purple-400/40" onClick={() => saveSettings({ signups_locked: !settings?.signups_locked })}>
              {settings?.signups_locked ? <><Unlock className="w-4 h-4 mr-1" /> Abrir cadastros</> : <><Lock className="w-4 h-4 mr-1" /> Travar cadastros</>}
            </Button>
            <Button size="sm" variant="outline" className="border-yellow-500/40 text-yellow-300" onClick={resetDailyPops}>
              <RotateCcw className="w-4 h-4 mr-1" /> Liberar balões de hoje
            </Button>
            <Button size="sm" variant="outline" className="border-red-500/40 text-red-400" onClick={resetSeason}>
              <Trash2 className="w-4 h-4 mr-1" /> Resetar temporada
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="CONFIGURAÇÕES DA TEMPORADA">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-purple-200/50">Início</label>
                <Input type="date" value={settings?.start_date ?? ""} onChange={(e) => saveSettings({ start_date: e.target.value })} className="bg-black/30 border-white/10" />
              </div>
              <div>
                <label className="text-[10px] text-purple-200/50">Fim</label>
                <Input type="date" value={settings?.end_date ?? ""} onChange={(e) => saveSettings({ end_date: e.target.value })} className="bg-black/30 border-white/10" />
              </div>
              <div>
                <label className="text-[10px] text-purple-200/50">Balões por dia</label>
                <Input
                  type="number"
                  min={1}
                  value={settings?.max_pops_per_day ?? 3}
                  onChange={(e) => saveSettings({ max_pops_per_day: Number(e.target.value) })}
                  className="bg-black/30 border-white/10"
                />
              </div>
              <div className="flex items-end text-[11px] text-purple-200/50">
                Jogo: <b className="ml-1 text-white">{settings?.is_open ? "aberto" : "pausado"}</b>
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[10px] text-purple-200/50">Regras (uma por linha)</label>
              <Textarea
                rows={7}
                value={settings?.rules_text ?? ""}
                onChange={(e) => setSettings((p) => (p ? { ...p, rules_text: e.target.value } : p))}
                className="bg-black/30 border-white/10 text-[11px]"
              />
              <Button size="sm" className="mt-2 bg-gradient-to-r from-[#9b5cff] to-[#6a3dd8]" onClick={() => saveSettings({ rules_text: settings?.rules_text ?? "" })}>
                <Save className="w-4 h-4 mr-1" /> Salvar regras
              </Button>
            </div>
          </Panel>

          <Panel title="PRÊMIOS">
            <div className="space-y-2">
              {(settings?.prizes ?? []).map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={p.icon} onChange={(e) => setPrize(i, "icon", e.target.value)} className="w-16 bg-black/30 border-white/10 text-center" />
                  <Input value={p.label} onChange={(e) => setPrize(i, "label", e.target.value)} className="flex-1 bg-black/30 border-white/10" />
                  <Button size="sm" variant="outline" className="border-red-500/40 text-red-400" onClick={() => setSettings((s) => (s ? { ...s, prizes: s.prizes.filter((_, idx) => idx !== i) } : s))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-purple-400/40" onClick={() => setSettings((s) => (s ? { ...s, prizes: [...s.prizes, { icon: "🎁", label: "PRÊMIO" }] } : s))}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
                <Button size="sm" className="bg-gradient-to-r from-[#9b5cff] to-[#6a3dd8]" onClick={() => saveSettings({ prizes: settings?.prizes ?? [] })}>
                  <Save className="w-4 h-4 mr-1" /> Salvar prêmios
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="BALÕES (VALOR E CHANCE)">
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {balloons.map((b) => (
                <div key={b.id} className="flex items-center gap-2">
                  <Input type="number" value={b.value} onChange={(e) => patchBalloon(b.id, { value: Number(e.target.value) })} className="w-24 bg-black/30 border-white/10" />
                  <Input type="number" step="0.5" value={b.weight} onChange={(e) => patchBalloon(b.id, { weight: Number(e.target.value) })} className="w-20 bg-black/30 border-white/10" />
                  <select
                    value={b.color}
                    onChange={(e) => patchBalloon(b.id, { color: e.target.value })}
                    className="rounded-md bg-black/30 border border-white/10 px-2 py-2 text-xs"
                  >
                    {["c1", "c2", "c3", "c4", "c5"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <Button size="sm" variant="outline" className="border-red-500/40 text-red-400" onClick={() => removeBalloon(b.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-2 border-purple-400/40" onClick={addBalloon}>
              <Plus className="w-4 h-4 mr-1" /> Novo balão
            </Button>
            <p className="mt-2 text-[10px] text-purple-200/40">Colunas: pontos · peso (chance) · cor</p>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Panel title="BÔNUS DE STREAK">
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Input type="number" value={r.days} onChange={(e) => patchRule(r.id, { days: Number(e.target.value) })} className="w-24 bg-black/30 border-white/10" />
                  <span className="text-[11px] text-purple-200/50">dias →</span>
                  <Input type="number" value={r.bonus_pct} onChange={(e) => patchRule(r.id, { bonus_pct: Number(e.target.value) })} className="w-24 bg-black/30 border-white/10" />
                  <span className="text-[11px] text-purple-200/50">%</span>
                  <Button size="sm" variant="outline" className="border-red-500/40 text-red-400" onClick={() => removeRule(r.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="border-purple-400/40" onClick={addRule}>
                <Plus className="w-4 h-4 mr-1" /> Nova regra
              </Button>
            </div>
          </Panel>

          <Panel title={`JOGADORES (${users.length})`} className="xl:col-span-2">
            <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2">
              {users.length === 0 && <p className="text-[11px] text-purple-200/40">Nenhum jogador cadastrado.</p>}
              {users.map((u) => (
                <div key={u.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${u.blocked ? "border-red-500/40 bg-red-500/5 opacity-70" : "border-white/10 bg-white/5"}`}>
                  <Input value={u.name} onChange={(e) => patchUser(u.id, { name: e.target.value })} className="w-40 bg-black/30 border-white/10 h-8 text-xs" />
                  <Input value={u.password} onChange={(e) => patchUser(u.id, { password: e.target.value })} className="w-20 bg-black/30 border-white/10 h-8 text-xs" />
                  <label className="text-[10px] text-purple-200/40">pts</label>
                  <Input type="number" value={u.points} onChange={(e) => patchUser(u.id, { points: Number(e.target.value) })} className="w-24 bg-black/30 border-white/10 h-8 text-xs" />
                  <label className="text-[10px] text-purple-200/40">streak</label>
                  <Input type="number" value={u.streak} onChange={(e) => patchUser(u.id, { streak: Number(e.target.value) })} className="w-16 bg-black/30 border-white/10 h-8 text-xs" />
                  <label className="text-[10px] text-purple-200/40">hoje</label>
                  <Input type="number" value={u.pops_today} onChange={(e) => patchUser(u.id, { pops_today: Number(e.target.value) })} className="w-16 bg-black/30 border-white/10 h-8 text-xs" />
                  <Input value={u.tz} onChange={(e) => patchUser(u.id, { tz: e.target.value })} className="w-40 bg-black/30 border-white/10 h-8 text-xs" />
                  <Button size="sm" variant="outline" className={u.blocked ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-300"} onClick={() => patchUser(u.id, { blocked: !u.blocked })}>
                    {u.blocked ? "Liberar" : "Desclassificar"}
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-500/40 text-red-400" onClick={() => deleteUser(u.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title={`LOGS (${logs.length})`}>
          <Button size="sm" variant="outline" className="mb-3 border-red-500/40 text-red-400" onClick={clearLogs}>
            <Trash2 className="w-4 h-4 mr-1" /> Limpar logs
          </Button>
          <div className="max-h-[300px] overflow-y-auto pr-1 space-y-1">
            {logs.map((l) => (
              <div key={l.id} className="flex justify-between border-b border-white/5 py-1 text-[11px]">
                <span>
                  <b>{l.name}</b>
                  <span className="ml-2 text-purple-200/40">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                </span>
                <span className={l.points < 0 ? "text-[#ff5c6a] font-bold" : "text-[#ffcf5c] font-bold"}>
                  {l.points > 0 ? "+" : ""}{l.points} pts {l.bonus ? `(bônus ${l.bonus})` : ""}
                </span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-[11px] text-purple-200/40">Sem registros.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default AdminBalao;
