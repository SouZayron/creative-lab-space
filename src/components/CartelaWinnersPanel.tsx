import { useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTables } from "@/hooks/useRealtimeTables";
import { Button } from "@/components/ui/button";
import { Trophy, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CardRow {
  id: string;
  card_number: number;
  user_name: string;
  numbers: number[];
  player_name: string | null;
}

interface Props {
  drawn: string[];
}

export function CartelaWinnersPanel({ drawn }: Props) {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bingo_cards")
      .select("id, card_number, user_name, numbers, player_name")
      .not("player_name", "is", null)
      .neq("player_name", "")
      .order("card_number", { ascending: true });
    setLoading(false);
    if (error) {
      console.error("load cards error", error);
      return;
    }
    setCards((data as unknown as CardRow[]) || []);
  }, []);

  useRealtimeTables({
    channelName: "cartela-winners-realtime",
    fallbackMs: 3000,
    onSync: load,
    tables: ["bingo_cards"],
  });

  const drawnSet = useMemo(() => new Set(drawn.map((d) => parseInt(d, 10))), [drawn]);

  const ranked = useMemo(() => {
    return cards
      .map((c) => {
        const nums = c.numbers || [];
        const hits = nums.filter((n) => drawnSet.has(n)).length;
        return { ...c, hits, total: nums.length, missing: nums.length - hits };
      })
      .sort((a, b) => a.missing - b.missing || a.card_number - b.card_number);
  }, [cards, drawnSet]);

  const winners = ranked.filter((c) => c.total > 0 && c.missing === 0);

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Quem bingou
        </h3>
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={load} disabled={loading}>
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {winners.length > 0 ? (
        <div className="rounded-xl border border-green-400/40 bg-green-500/15 p-3 space-y-1">
          {winners.map((w) => (
            <p key={w.id} className="text-sm font-bold text-green-300">
              🎉 BINGO! {w.player_name} — cartela #{w.card_number}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum bingo ainda.</p>
      )}

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Users className="w-3.5 h-3.5" />
        {ranked.length} jogador(es) com cartela cadastrada
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {ranked.map((c) => (
          <div
            key={c.id}
            className={cn(
              "rounded-lg border p-2",
              c.missing === 0
                ? "border-green-400/50 bg-green-500/10"
                : "border-white/10 bg-white/5"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-foreground truncate">
                {c.player_name}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                #{c.card_number} • {c.hits}/{c.total}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(c.numbers || []).map((n) => (
                <span
                  key={n}
                  className={cn(
                    "w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center",
                    drawnSet.has(n)
                      ? "bg-green-500 text-white"
                      : "bg-white/10 text-muted-foreground"
                  )}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
