import { IconStarsFilled } from "@tabler/icons-react";
import { useApp } from "../../context";

export function LevelUpOverlay() {
  const { levelUp, dismissLevelUp } = useApp();
  if (!levelUp) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(5,3,8,0.72)] levelup-fade"
      onClick={dismissLevelUp}
    >
      <div className="levelup-pop relative flex flex-col items-center px-10 py-8 text-center">
        <div className="levelup-glow absolute inset-0 -z-10 rounded-full" />
        <IconStarsFilled size={56} className="levelup-star text-[var(--gr-gilded-bright)]" />
        <div className="mt-3 font-label text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
          Ascensión
        </div>
        <div className="mt-1 font-display text-3xl font-bold leading-none text-[var(--gr-gilded-bright)]">
          Nivel {levelUp.level}
        </div>
        <div className="mt-2 font-display text-base italic tracking-wide text-[var(--gr-gilded)]">
          {levelUp.title}
        </div>
      </div>
    </div>
  );
}
