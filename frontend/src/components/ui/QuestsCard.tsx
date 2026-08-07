import { useCallback, useEffect, useState } from "react";
import { IconTargetArrow } from "@tabler/icons-react";
import { Api } from "../../api/endpoints";
import { useApp } from "../../context";
import { TablerIcon } from "../TablerIcon";
import { Card } from "./Card";
import type { Quest } from "../../types";

export function QuestsCard() {
  const { handleXP } = useApp();
  const [quests, setQuests] = useState<Quest[]>([]);

  const load = useCallback(async () => {
    try { setQuests(await Api.listQuests()); } catch { /* offline */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const claim = async (q: Quest) => {
    try { handleXP(await Api.claimQuest(q.id)); load(); } catch { /* */ }
  };

  const daily = quests.filter((q) => q.scope === "daily");
  const weekly = quests.filter((q) => q.scope === "weekly");

  return (
    <Card title="Misiones" icon={<IconTargetArrow size={14} />}>
      <Group label="Diarias" quests={daily} onClaim={claim} />
      <div className="mt-2 border-t border-[var(--border)] pt-2">
        <Group label="Semanales" quests={weekly} onClaim={claim} />
      </div>
    </Card>
  );
}

function Group({ label, quests, onClaim }: { label: string; quests: Quest[]; onClaim: (q: Quest) => void }) {
  return (
    <div>
      <div className="mb-1.5 font-label text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
      <div className="space-y-2">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          const claimable = q.completed && !q.claimed;
          return (
            <div key={q.id} className="text-sm">
              <div className="flex items-center gap-2">
                <TablerIcon name={q.icon} size={14} className={q.claimed ? "text-[var(--success)]" : "text-[var(--text-muted)]"} />
                <span className={`flex-1 ${q.claimed ? "text-[var(--text-faint)] line-through" : "text-[var(--text-body)]"}`}>{q.title}</span>
                <span className="tabular text-xs text-[var(--text-muted)]">{q.progress}/{q.target}</span>
                {claimable ? (
                  /* Misión cumplida y sin reclamar: es lo único dorado de la card. */
                  <button onClick={() => onClaim(q)} className="gr-reward rounded border border-[var(--gr-gilded)] bg-[var(--gr-gilded-deep)] px-1.5 py-0.5 font-label text-xs text-[var(--gr-gilded-bright)] hover:border-[var(--gr-gilded-bright)]">
                    +{q.xp_reward}
                  </button>
                ) : (
                  <span className="font-label text-xs text-[var(--text-faint)]">{q.claimed ? "✓" : `+${q.xp_reward}`}</span>
                )}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: q.claimed ? "var(--success)" : "linear-gradient(90deg,var(--gr-xp-from),var(--gr-arcane))" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
