import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTables } from "@/hooks/useRealtimeTables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LayoutGrid, Check, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CardRow {
  id: string;
  card_number: number;
  user_name: string;
  player_name: string | null;
}

interface Props {
  eventName: string;
  defaultPlayerName?: string;
}

export function CartelaClaimPanel({ eventName, defaultPlayerName = "" }: Props) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<CardRow | null>(null);
  const [nameInput, setNameInput] = useState(defaultPlayerName);
  const [saving, setSaving] = useState(false);
  const myCardKey = `cartela-claim-${eventName}`;
  const [myCard, setMyCard] = useState<CardRow | null>(() => {
    try {
      const raw = localStorage.getItem(`cartela-claim-${eventName}`);
      return raw ? (JSON.parse(raw) as CardRow) : null;
    } catch {
      return null;
    }
  });
  // guarda o último nome conhecido de cada cartela: uma vez reservada, nunca volta a "livre"
  const knownNames = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!eventName) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("bingo_cards")
      .select("id, card_number, user_name, player_name")
      .eq("user_name", eventName)
      .order("card_number", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("load cartelas error", error);
      return;
    }
    const rows = ((data as unknown as CardRow[]) || []).map((row) => {
      const remote = (row.player_name || "").trim();
      if (remote) {
        knownNames.current[row.id] = remote;
        return { ...row, player_name: remote };
      }
      return { ...row, player_name: knownNames.current[row.id] || null };
    });
    setCards(rows);
  }, [eventName]);

  useRealtimeTables({
    channelName: "cartela-claim-realtime",
    enabled: !!eventName,
    fallbackMs: 2500,
    onSync: load,
    tables: ["bingo_cards", "cartelas_event"],
  });

  const cardUrl = (card: CardRow) =>
    `${window.location.origin}/bingo/cartela/${card.user_name}/${card.card_number}`;

  const claim = async () => {
    if (!selected) return;
    if (myCard) {
      toast.error(`Você já reservou a cartela #${myCard.card_number}`);
      setSelected(null);
      return;
    }
    const name = nameInput.trim().slice(0, 40);
    if (!name) {
      toast.error("Digite seu nome");
      return;
    }
    const duplicated = cards.find(
      (c) => (c.player_name || "").trim().toLowerCase() === name.toLowerCase()
    );
    if (duplicated) {
      toast.error(`Esse nome já está na cartela #${duplicated.card_number}`);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("bingo_cards")
      .update({ player_name: name })
      .eq("id", selected.id)
      .or("player_name.is.null,player_name.eq.")
      .select()
      .maybeSingle();
    setSaving(false);


    if (error) {
      console.error("claim error", error);
      toast.error("Erro ao reservar a cartela");
      return;
    }
    if (!data) {
      toast.error("Essa cartela já foi escolhida por outro jogador");
      setSelected(null);
      load();
      return;
    }

    const claimed = { ...selected, player_name: name };
    knownNames.current[claimed.id] = name;
    setMyCard(claimed);
    try {
      localStorage.setItem(myCardKey, JSON.stringify(claimed));
    } catch { /* noop */ }
    setSelected(null);
    load();
    toast.success(`Cartela #${claimed.card_number} é sua!`);
    window.open(cardUrl(claimed), "_blank");
  };


  return (
    <div className="zgames-page zgames-grid-line min-h-screen p-4">
      <div className="max-w-5xl mx-auto w-full">
        <div className="text-center mb-4">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            🎯 Bingo de Cartelas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Escolha o número da sua cartela, coloque seu nome e acesse
          </p>
        </div>

        {myCard && (
          <div className="mb-4 rounded-2xl border border-green-400/40 bg-green-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-green-300">
              Sua cartela: #{myCard.card_number} — {myCard.player_name}
            </p>
            <Button
              size="sm"
              onClick={() => window.open(cardUrl(myCard), "_blank")}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir minha cartela
            </Button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-foreground flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-purple-400" />
              {cards.length} cartelas
            </span>
            <Button size="sm" variant="outline" className="h-8" onClick={load} disabled={loading}>
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </Button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
            {cards.map((card) => {
              const taken = !!card.player_name;
              const isMine = myCard?.id === card.id;
              const locked = taken || (!!myCard && !isMine);
              return (
                <button
                  key={card.id}
                  disabled={locked}
                  onClick={() => {
                    if (myCard) {
                      toast.error(`Você já reservou a cartela #${myCard.card_number}`);
                      return;
                    }
                    setSelected(card);
                    setNameInput(defaultPlayerName);
                  }}
                  className={cn(
                    "aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 p-1 transition-all",
                    isMine
                      ? "border-green-400/50 bg-green-500/20"
                      : locked
                        ? "border-white/5 bg-white/5 opacity-60 cursor-not-allowed"
                        : "border-purple-400/30 bg-purple-500/15 hover:bg-purple-500/30 hover:scale-[1.03]"
                  )}
                >
                  <span className="text-lg font-extrabold text-foreground">#{card.card_number}</span>
                  <span className="text-[10px] leading-tight text-center text-muted-foreground truncate w-full px-1">
                    {taken ? card.player_name : "livre"}
                  </span>
                </button>
              );
            })}

          </div>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cartela #{selected?.card_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Seu nome"
              value={nameInput}
              maxLength={40}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && claim()}
            />
            <Button
              onClick={claim}
              disabled={saving}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
            >
              <Check className="w-4 h-4 mr-2" />
              {saving ? "Salvando..." : "OK, é minha"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
