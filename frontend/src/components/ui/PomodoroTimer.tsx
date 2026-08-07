import { IconPlayerPlay, IconPlayerPause, IconRotateClockwise, IconPlayerSkipForward } from "@tabler/icons-react";
import { formatTime, type Phase } from "../../hooks/usePomodoro";

const PHASE_LABEL: Record<Phase, string> = {
  work: "Foco",
  short: "Descanso corto",
  long: "Descanso largo",
};

export function PomodoroTimer({
  phase, secondsLeft, running, progress, subtitle, onStart, onPause, onReset, onSkip, big = true,
}: {
  phase: Phase;
  secondsLeft: number;
  running: boolean;
  progress: number;
  subtitle?: string;
  onStart: () => void;
  onPause: () => void;
  onReset?: () => void;
  onSkip?: () => void;
  big?: boolean;
}) {
  return (
    <div className="text-center">
      {/* 56px es el único tamaño por encima de la escala, y es deliberado: la
          cuenta atrás a pantalla completa es la cifra héroe de la app. En card
          usa el peldaño de cifra (34), no un valor suelto. */}
      <div
        className="font-display font-bold leading-none text-[var(--gr-arcane-bright)]"
        style={{ fontSize: big ? 56 : 34, letterSpacing: "0.05em" }}
      >
        {formatTime(secondsLeft)}
      </div>
      <div className="mt-1 text-xs italic text-[var(--text-muted)]">
        {PHASE_LABEL[phase]}{subtitle ? ` — ${subtitle}` : ""}
      </div>
      {big && (
        <div className="mx-auto my-3 h-1.5 max-w-xs overflow-hidden rounded bg-[var(--bg-elevated)]">
          <div className="h-full rounded" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, var(--xp-from), var(--xp-to))" }} />
        </div>
      )}
      <div className="mt-2 flex items-center justify-center gap-2">
        {running ? (
          <button className="btn" onClick={onPause}><IconPlayerPause size={13} /> Pausar</button>
        ) : (
          <button className="btn btn-primary" onClick={onStart}><IconPlayerPlay size={13} /> Iniciar</button>
        )}
        {onReset && <button className="btn" onClick={onReset}><IconRotateClockwise size={13} /> Reiniciar</button>}
        {onSkip && <button className="btn" onClick={onSkip}><IconPlayerSkipForward size={13} /> Saltar</button>}
      </div>
    </div>
  );
}
