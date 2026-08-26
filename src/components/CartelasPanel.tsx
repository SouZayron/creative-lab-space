import { useState } from "react";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LayoutGrid, Shuffle, Link2, Copy, Check, Loader2, Palette, Power, PowerOff, Scissors } from "lucide-react";
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
  const [eventName, setEventName] = useState("");
  const [title, setTitle] = useState("Bingo LabXat");
  const [subtitle, setSubtitle] = useState("Boa sorte!");
  const [quantity, setQuantity] = useState(1);
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>("purple");
  const [generatedCards, setGeneratedCards] = useState<GeneratedCard[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shortLinks, setShortLinks] = useState<Record<string, string>>({});
  const [shorteningId, setShorteningId] = useState<string | null>(null);
  const [isShorteningAll, setIsShorteningAll] = useState(false);

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
      setGeneratedCards(
        (data || []).map((card) => ({
          id: card.id,
          cardNumber: card.card_number,
          numbers: card.numbers,
          userName: card.user_name,
          title: card.title,
          subtitle: card.subtitle,
          theme: card.theme,
        }))
      );
      toast.success(`${quantity} cartela${quantity > 1 ? "s" : ""} gerada${quantity > 1 ? "s" : ""}!`);
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
            <Button size="sm" variant="outline" onClick={copyAllLinks}>
              <Copy className="w-4 h-4 mr-2" />
              Copiar todos
            </Button>
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
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
                >
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
                        {card.userName} • {theme.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
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
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
