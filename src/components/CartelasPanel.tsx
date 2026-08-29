import { useState, useEffect, useCallback } from "react";
import { useRealtimeTables } from "@/hooks/useRealtimeTables";

const LS_KEY = "control_cartelas_state";
const loadState = (): Record<string, unknown> => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
};
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LayoutGrid, Shuffle, Link2, Copy, Check, Loader2, Palette, Power, PowerOff, Scissors, UserPlus, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { cardThemes, type ThemeKey } from "@/pages/BingoCards";

interface GeneratedCard {
  id: string;
  cardNumber: number;
  numbers: number[];
  userName: string;
  title: string;
  subtitle: string;
  theme: string;
  playerName: string;
}


const DEFAULT_PASSWORD = "7845";

function generateCardNumbers(): number[] {
  const numbers: number[] = [];
  while (numbers.length < 25) {
    const num = Math.floor(Math.random() * 90) + 1;
    if (!numbers.includes(num)) numbers.push(num);
  }
  return numbers.sort((a, b) => a - b);
}

function normalizeUserName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getCardPath(userName: string, cardNumber: number): string {
  return `/bingo/cartela/${normalizeUserName(userName)}/${cardNumber}`;
}

interface CartelasPanelProps {
  moduleActive?: boolean;
  onToggleModule?: (active: boolean) => void;
}

export function CartelasPanel({ moduleActive = false, onToggleModule }: CartelasPanelProps) {
  const [eventName, setEventName] = useState<string>(() => (loadState().eventName as string) ?? "");
  const [title, setTitle] = useState<string>(() => (loadState().title as string) ?? "Bingo LabXat");
  const [subtitle, setSubtitle] = useState<string>(() => (loadState().subtitle as string) ?? "Boa sorte!");
  const [quantity, setQuantity] = useState<number>(() => (loadState().quantity as number) ?? 1);
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>(() => (loadState().selectedTheme as ThemeKey) ?? "purple");
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>(() => (loadState().generatedCards as GeneratedCard[]) ?? []);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedNumbersId, setCopiedNumbersId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shortLinks, setShortLinks] = useState<Record<string, string>>(() => (loadState().shortLinks as Record<string, string>) ?? {});
  const [shorteningId, setShorteningId] = useState<string | null>(null);
  const [isShorteningAll, setIsShorteningAll] = useState(false);
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, string>>(() => (loadState().playerDrafts as Record<string, string>) ?? {});
  const [panelOpen, setPanelOpen] = useState<boolean>(() => (loadState().panelOpen as boolean) ?? true);

  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ eventName, title, subtitle, quantity, selectedTheme, generatedCards, shortLinks, playerDrafts, panelOpen })
      );
    } catch { /* noop */ }
  }, [eventName, title, subtitle, quantity, selectedTheme, generatedCards, shortLinks, playerDrafts, panelOpen]);
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);

  const activeEventUser = generatedCards[0]?.userName || "";

  // publica o evento ativo para a página /games
  useEffect(() => {
    // nunca sobrescreve o evento quando esta sessão não tem cartelas geradas
    // (ex.: /control aberto em outro navegador sem o estado local)
    if (!activeEventUser || generatedCards.length === 0) return;
    supabase
      .from("cartelas_event")
      .upsert({
        id: 1,
        event_name: activeEventUser,
        total_cards: generatedCards.length,
        is_active: moduleActive && panelOpen,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => { if (error) console.error("cartelas_event sync", error); });
  }, [moduleActive, panelOpen, activeEventUser, generatedCards.length]);



  // sincroniza jogadores que reservaram cartela pelo /games (realtime)
  const syncPlayers = useCallback(async () => {
    if (!activeEventUser) return;
    const { data } = await supabase
      .from("bingo_cards")
      .select("id, player_name")
      .eq("user_name", activeEventUser);
    if (!data) return;
    const map = new Map(data.map((d) => [d.id, (d as { player_name?: string | null }).player_name || ""]));
    setGeneratedCards((prev) =>
      prev.map((c) => (map.has(c.id) ? { ...c, playerName: map.get(c.id) as string } : c))
    );
    // remove rascunhos desatualizados para o nome remoto sempre aparecer
    setPlayerDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      map.forEach((remote, id) => {
        if (remote && next[id] !== undefined && next[id].trim() !== remote) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeEventUser]);

  useRealtimeTables({
    channelName: "control-cartelas-realtime",
    enabled: !!activeEventUser,
    fallbackMs: 2500,
    onSync: syncPlayers,
    tables: ["bingo_cards"],
  });

  const savePlayerName = async (card: GeneratedCard) => {
    const name = (playerDrafts[card.id] ?? card.playerName).trim().slice(0, 40);
    setSavingPlayerId(card.id);
    // string vazia libera a cartela (nunca null: o banco preserva o nome existente)
    const { error } = await supabase
      .from("bingo_cards")
      .update({ player_name: name })
      .eq("id", card.id);
    setSavingPlayerId(null);
    if (error) {
      console.error("save player error", error);
      toast.error("Erro ao salvar jogador");
      return;
    }
    setGeneratedCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, playerName: name } : c))
    );
    setPlayerDrafts((prev) => {
      const next = { ...prev };
      delete next[card.id];
      return next;
    });
    toast.success(name ? `Jogador "${name}" vinculado à cartela #${card.cardNumber}` : "Jogador removido");
  };



  const removePlayer = async (card: GeneratedCard) => {
    setSavingPlayerId(card.id);
    const { error } = await supabase
      .from("bingo_cards")
      .update({ player_name: "" })
      .eq("id", card.id);
    setSavingPlayerId(null);
    if (error) {
      console.error("remove player error", error);
      toast.error("Erro ao remover jogador");
      return;
    }
    setGeneratedCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, playerName: "" } : c))
    );
    setPlayerDrafts((prev) => ({ ...prev, [card.id]: "" }));
    toast.success(`Cartela #${card.cardNumber} liberada`);
  };

  const fullLink = (card: GeneratedCard) =>
    `${window.location.origin}${getCardPath(card.userName, card.cardNumber)}`;

  const shortenUrl = async (url: string): Promise<string | null> => {
    const { data, error } = await supabase.functions.invoke("shorten-link", { body: { url } });
    if (error || !data?.shortUrl) {
      console.error("shorten-link error", error, data);
      return null;
    }
    return data.shortUrl as string;
  };

  const handleShorten = async (card: GeneratedCard) => {
    if (shortLinks[card.id]) {
      await navigator.clipboard.writeText(shortLinks[card.id]);
      toast.success("Link curto copiado!");
      return;
    }
    setShorteningId(card.id);
    const short = await shortenUrl(fullLink(card));
    setShorteningId(null);
    if (!short) {
      toast.error("Não foi possível encurtar o link");
      return;
    }
    setShortLinks((prev) => ({ ...prev, [card.id]: short }));
    await navigator.clipboard.writeText(short);
    toast.success("Link curto gerado e copiado!");
  };

  const handleShortenAll = async () => {
    if (generatedCards.length === 0) return;
    setIsShorteningAll(true);
    const result: Record<string, string> = { ...shortLinks };
    for (const card of generatedCards) {
      if (result[card.id]) continue;
      const short = await shortenUrl(fullLink(card));
      if (short) result[card.id] = short;
    }
    setShortLinks(result);
    setIsShorteningAll(false);
    const lines = generatedCards
      .map((c) => `#${c.cardNumber}: ${result[c.id] || fullLink(c)}`)
      .join("\n");
    await navigator.clipboard.writeText(lines);
    toast.success("Links curtos gerados e copiados!");
  };

  const handleGenerate = async () => {
    if (!eventName.trim()) {
      toast.error("Digite o nome do evento");
      return;
    }

    setIsGenerating(true);
    const normalizedName = normalizeUserName(eventName.trim());
    const cardTitle = title.trim() || "Bingo LabXat";
    const cardSubtitle = subtitle.trim() || "Boa sorte!";

    try {
      const cardsToInsert = Array.from({ length: quantity }, (_, i) => ({
        user_name: normalizedName,
        card_number: i + 1,
        title: cardTitle,
        subtitle: cardSubtitle,
        numbers: generateCardNumbers(),
        marked_numbers: [] as number[],
        theme: selectedTheme,
        user_password: DEFAULT_PASSWORD,
      }));

      await supabase.from("bingo_cards").delete().eq("user_name", normalizedName);

      const { data, error } = await supabase.from("bingo_cards").insert(cardsToInsert).select();

      if (error) {
        console.error("Error saving cards:", error);
        toast.error("Erro ao salvar cartelas");
        return;
      }

      setShortLinks({});
      setPlayerDrafts({});
      setGeneratedCards(
        (data || []).map((card) => ({
          id: card.id,
          cardNumber: card.card_number,
          numbers: card.numbers,
          userName: card.user_name,
          title: card.title,
          subtitle: card.subtitle,
          theme: card.theme,
          playerName: (card as { player_name?: string | null }).player_name || "",
        }))
      );

      setPanelOpen(true);
      onToggleModule?.(true);
      toast.success(`${quantity} cartela${quantity > 1 ? "s" : ""} gerada${quantity > 1 ? "s" : ""}! Painel /games e roleta ativados.`);
    } catch (err) {
      console.error("Error generating cards:", err);
      toast.error("Erro ao gerar cartelas");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyLink = async (card: GeneratedCard) => {
    await navigator.clipboard.writeText(shortLinks[card.id] || fullLink(card));
    setCopiedId(card.id);
    toast.success("Link copiado!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllLinks = async () => {
    const all = generatedCards
      .map((c) => `#${c.cardNumber}: ${shortLinks[c.id] || fullLink(c)}`)
      .join("\n");
    await navigator.clipboard.writeText(all);
    toast.success("Todos os links copiados!");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full min-h-0">
      <GlassCard className="p-6 overflow-y-auto">
        <div className="grid gap-6">
          <div className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border",
            moduleActive
              ? "border-green-400/40 bg-green-500/10"
              : "border-white/10 bg-white/5"
          )}>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2.5 h-2.5 rounded-full",
                moduleActive ? "bg-green-400 animate-pulse" : "bg-muted-foreground/40"
              )} />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Módulo de Cartelas {moduleActive ? "ativo" : "inativo"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ativa a roleta de 1 a 90 na aba Roletas
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setPanelOpen((v) => !v)}
                variant="outline"
                className={cn(
                  "font-semibold",
                  panelOpen ? "border-amber-400/40 text-amber-300" : "border-green-400/40 text-green-300"
                )}
              >
                {panelOpen ? (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" /> Fechar painel /games
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4 mr-2" /> Abrir painel /games
                  </>
                )}
              </Button>
              <Button
                onClick={() => onToggleModule?.(!moduleActive)}
                className={cn(
                  "text-white font-semibold",
                  moduleActive
                    ? "bg-gradient-to-r from-red-500 to-red-600"
                    : "bg-gradient-to-r from-green-500 to-emerald-600"
                )}
              >
                {moduleActive ? (
                  <>
                    <PowerOff className="w-4 h-4 mr-2" /> Desativar módulo
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4 mr-2" /> Ativar módulo
                  </>
                )}
              </Button>
            </div>
          </div>


          <div className="grid gap-2">
            <Label htmlFor="eventName" className="text-foreground">Nome do evento</Label>
            <Input
              id="eventName"
              placeholder="Ex: bingo-sexta"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="bg-background/50 border-border/50"
            />
            {eventName.trim() && (
              <p className="text-xs text-muted-foreground">
                Link base: /bingo/cartela/{normalizeUserName(eventName)}/1
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title" className="text-foreground">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-background/50 border-border/50"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="subtitle" className="text-foreground">Subtítulo</Label>
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="bg-background/50 border-border/50"
              />
            </div>
          </div>

          <div className="grid gap-3">
            <Label className="text-foreground flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Tema das cartelas
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(Object.entries(cardThemes) as [ThemeKey, typeof cardThemes[ThemeKey]][]).map(([key, theme]) => (
                <button
                  key={key}
                  onClick={() => setSelectedTheme(key)}
                  className={cn(
                    "relative p-2 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2",
                    selectedTheme === key
                      ? "border-white/50 scale-105 shadow-lg"
                      : "border-transparent hover:border-white/20"
                  )}
                >
                  <div className={cn("w-full h-7 rounded-md bg-gradient-to-r", theme.preview)} />
                  <span className="text-[11px] font-medium text-foreground whitespace-nowrap">{theme.name}</span>
                  {selectedTheme === key && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-background" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground">Quantidade de cartelas</Label>
              <span className="text-lg font-bold text-zgames-purple">{quantity}</span>
            </div>
            <Slider
              value={[quantity]}
              onValueChange={(value) => setQuantity(value[0])}
              min={1}
              max={50}
              step={1}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>50</span>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-zgames-blue to-zgames-purple hover:brightness-110 text-white font-semibold py-6"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Shuffle className="w-5 h-5 mr-2" />
                Gerar Cartelas
              </>
            )}
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-zgames-purple" />
            Cartelas Geradas ({generatedCards.length})
          </h2>
          {generatedCards.length > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleShortenAll} disabled={isShorteningAll}>
                {isShorteningAll ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Scissors className="w-4 h-4 mr-2" />
                )}
                Encurtar todos
              </Button>
              <Button size="sm" variant="outline" onClick={copyAllLinks}>
                <Copy className="w-4 h-4 mr-2" />
                Copiar todos
              </Button>
            </div>
          )}
        </div>

        {generatedCards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cartela gerada ainda.</p>
        ) : (
          <div className="grid gap-2">
            {generatedCards.map((card) => {
              const theme = cardThemes[card.theme as ThemeKey] || cardThemes.purple;
              return (
                <div
                  key={card.id}
                  className="grid gap-2 p-3 rounded-lg bg-white/5 border border-white/10"
                >
                  <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold",
                        theme.preview
                      )}
                    >
                      #{card.cardNumber}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{card.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {shortLinks[card.id] || `${card.userName} • ${theme.name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShorten(card)}
                      disabled={shorteningId === card.id}
                      title="Gerar link encurtado"
                    >
                      {shorteningId === card.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Scissors className={cn("w-4 h-4", shortLinks[card.id] && "text-green-500")} />
                      )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => copyLink(card)}>
                      {copiedId === card.id ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <a
                      href={getCardPath(card.userName, card.cardNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" className={cn("bg-gradient-to-r text-white", theme.preview)}>
                        <Link2 className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <Input
                      value={playerDrafts[card.id] ?? card.playerName}
                      onChange={(e) =>
                        setPlayerDrafts((p) => ({ ...p, [card.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") savePlayerName(card);
                      }}
                      maxLength={40}
                      placeholder="Nome do jogador"
                      className="h-8 text-sm bg-background/50 border-border/50"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => savePlayerName(card)}
                      disabled={savingPlayerId === card.id}
                    >
                      {savingPlayerId === card.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "OK"
                      )}
                    </Button>
                    {card.playerName && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 border-red-400/40 text-red-300 hover:bg-red-500/10"
                        title="Remover jogador e liberar cartela"
                        onClick={() => removePlayer(card)}
                        disabled={savingPlayerId === card.id}
                      >
                        <UserMinus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {card.playerName && (
                    <p className="text-[11px] text-green-400">
                      Jogador vinculado: {card.playerName}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                    <p className="flex-1 text-[11px] font-mono text-muted-foreground truncate">
                      {card.numbers.join(" ")}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 shrink-0"
                      title="Copiar números"
                      onClick={() => {
                        navigator.clipboard.writeText(card.numbers.join(" "));
                        setCopiedNumbersId(card.id);
                        toast.success("Números copiados!");
                        setTimeout(() => setCopiedNumbersId(null), 1500);
                      }}
                    >
                      {copiedNumbersId === card.id ? (
                        <Check className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>

                </div>

              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
