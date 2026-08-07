import { useEffect, useState } from "react";
import { Api } from "../api/endpoints";
import { AchievementCard } from "../components/ui/AchievementCard";
import { TIER_META } from "../utils";
import type { Achievement, Tier } from "../types";

const TIER_ORDER: Tier[] = ["legendary", "epic", "rare", "common"];
type Filter = "all" | Tier | "unlocked";

export default function Achievements() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    Api.listAchievements().then(setItems).catch(() => {});
  }, []);

  const unlocked = items.filter((a) => a.unlocked).length;
  const shown = items
    .filter((a) => filter === "all" || (filter === "unlocked" ? a.unlocked : a.tier === filter))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  const chips: { key: Filter; label: string; color?: string }[] = [
    { key: "all", label: "Todos" },
    { key: "unlocked", label: "Desbloqueados" },
    ...TIER_ORDER.map((t) => ({ key: t as Filter, label: TIER_META[t].label, color: TIER_META[t].color })),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="gr-title-module">Logros</h1>
        <span className="font-label text-xs text-[var(--text-muted)]">{unlocked} / {items.length} desbloqueados</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className="rounded-full border px-2.5 py-1 font-label text-xs uppercase tracking-[0.08em]"
              style={{
                borderColor: filter === c.key ? (c.color ?? "var(--border-glow)") : "var(--border)",
                color: filter === c.key ? (c.color ?? "var(--purple-main)") : "var(--text-muted)",
                background: filter === c.key ? "var(--bg-elevated)" : "transparent",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((a) => (
          <AchievementCard key={a.id} a={a} />
        ))}
      </div>
    </div>
  );
}
