import { useEffect, useState } from "react";
import { Api } from "../api/endpoints";
import { AchievementCard } from "../components/ui/AchievementCard";
import { Card } from "../components/ui/Card";
import { NextAchievement } from "../components/ui/NextAchievement";
import { SectionBand } from "../components/ui/SectionBand";
import type { SigilName } from "../components/ui/Sigil";
import { PageHeader } from "../components/layout/PageHeader";
import { TIER_META } from "../utils";
import type { Achievement, Tier } from "../types";

const TIER_ORDER: Tier[] = ["legendary", "epic", "rare", "common"];
type Filter = "all" | Tier | "unlocked";

/* Cuanto más raro, más anidada la marca: el hexágono con rombo dentro para la
   legendaria, el rombo con rombo para la épica, el rombo llano para la rara y
   el círculo para la común. La jerarquía se lee en la geometría, no sólo en el
   color — que es lo que la deja legible para quien no distingue los cuatro. */
const TIER_SIGIL: Record<Tier, SigilName> = {
  legendary: "hexagonoAnidado",
  epic: "romboAnidado",
  rare: "romboLlano",
  common: "circulo",
};

export default function Achievements() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    Api.listAchievements().then(setItems).catch(() => {});
  }, []);

  const unlocked = items.filter((a) => a.unlocked).length;
  const shown = items.filter((a) => filter === "all" || (filter === "unlocked" ? a.unlocked : a.tier === filter));
  const byTier = Object.fromEntries(
    TIER_ORDER.map((t) => [t, shown.filter((a) => a.tier === t)]),
  ) as Record<Tier, Achievement[]>;

  const chips: { key: Filter; label: string; color?: string }[] = [
    { key: "all", label: "Todos" },
    { key: "unlocked", label: "Desbloqueados" },
    ...TIER_ORDER.map((t) => ({ key: t as Filter, label: TIER_META[t].label, color: TIER_META[t].color })),
  ];

  return (
    <div className="space-y-3">
      {/* El recuento va en oro: son logros desbloqueados, la definición misma
          de lo que el usuario se ganó. */}
      <PageHeader
        title="Logros"
        context={
          <span className="tabular not-italic text-[var(--gr-gilded)]">
            {unlocked} / {items.length} desbloqueados
          </span>
        }
      >
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
      </PageHeader>
      {/* Dos columnas: la rejilla por rareza a la izquierda, y a la derecha
          «el más cercano» sobre «el repartimiento». La vista contestaba sólo
          qué hay; ahora contesta también qué sigue, que es a lo que se entra. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <div className="min-w-0 lg:flex-[2.1]">
      {TIER_ORDER.filter((t) => byTier[t].length > 0).map((t) => (
        <div key={t} className="pt-2.5 first:pt-0">
          <SectionBand
            sigil={TIER_SIGIL[t]}
            label={TIER_META[t].label}
            count={`${byTier[t].filter((a) => a.unlocked).length}/${byTier[t].length}`}
            tone={TIER_META[t].color}
            fill="linea"
            spine
          >
            <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
              {byTier[t].map((a) => (
                <AchievementCard key={a.id} a={a} />
              ))}
            </div>
          </SectionBand>
        </div>
      ))}
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:flex-1">
      <NextAchievement items={items} />

      <Card rank="pozo">
        <SectionBand sigil="diamante" label="El repartimiento" fill="cadena"
                     count={`${unlocked}/${items.length}`}>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {TIER_ORDER.map((t) => {
              const all = items.filter((a) => a.tier === t);
              if (all.length === 0) return null;
              const got = all.filter((a) => a.unlocked).length;
              return (
                <div key={t} className="min-w-[130px] flex-1">
                  <div className="flex items-baseline gap-2 font-label text-xs">
                    <span style={{ color: TIER_META[t].color }}>{TIER_META[t].label}</span>
                    <span className="ml-auto tabular text-[var(--text-faint)]">{got}/{all.length}</span>
                  </div>
                  {/* Un punto por logro, encendido si está caído. Una barra de
                      porcentaje diría lo mismo pero no dejaría contar. */}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {all.map((a) => (
                      <span
                        key={a.id}
                        title={a.name}
                        className="h-1.5 w-3.5 rounded-xs"
                        style={{
                          background: a.unlocked ? TIER_META[t].color : "var(--gr-surface-raised)",
                          border: `1px solid ${a.unlocked ? TIER_META[t].color : "var(--gr-edge)"}`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionBand>
      </Card>
      </div>
      </div>
    </div>
  );
}
