import { IconPlayerPlay, IconPlayerPause, IconRotateClockwise, IconPlayerSkipForward } from "@tabler/icons-react";
import { formatTime, CYCLE_LENGTH, type Phase } from "../../hooks/usePomodoro";

const PHASE_LABEL: Record<Phase, string> = {
  work: "Foco",
  short: "Descanso corto",
  long: "Descanso largo",
};

export function PomodoroTimer({
  phase, secondsLeft, running, progress, subtitle, cycleDone = 0, onStart, onPause, onReset, onSkip, big = true,
}: {
  phase: Phase;
  secondsLeft: number;
  running: boolean;
  progress: number;
  subtitle?: string;
  /** bloques de foco completados del ciclo vivo */
  cycleDone?: number;
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
          usa el peldaño de cifra (34), no un valor suelto.

          Va en el rol de cifra y no en Cinzel: Cinzel no tiene versión tabular
          de los dígitos —`tabular-nums` no le hace nada— y "11:11" mide 6,2px
          menos que "25:00" a 56px, así que la cuenta atrás saltaba de lado cada
          vez que entraba o salía un 1. Con Inter tabular la oscilación es 0. */}
      <div
        className="gr-figure font-bold text-[var(--gr-arcane-bright)]"
        style={{ fontSize: big ? 56 : 34 }}
      >
        {formatTime(secondsLeft)}
      </div>
      <div className="mt-1 text-xs italic text-[var(--text-muted)]">
        {PHASE_LABEL[phase]}{subtitle ? ` — ${subtitle}` : ""}
      </div>
      {big && (
        <div className="mx-auto my-3 h-1.5 max-w-xs overflow-hidden rounded bg-[var(--bg-elevated)]">
          {/* El tiempo transcurrido no es recompensa: usaba el degradado de XP
              y terminaba en dorado. Aquí el arcano es lo correcto. */}
          <div className="h-full rounded" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, var(--gr-xp-from), var(--gr-arcane))" }} />
        </div>
      )}
      {/* Dónde va el ciclo de cuatro. El bloque cumplido sí es recompensa —cuenta
          para el descanso largo y para los logros de foco—, así que va en oro;
          lo que falta se queda en el filo. */}
      {big && (
        <div
          className="mx-auto flex items-center justify-center gap-1.5"
          role="img"
          aria-label={`${cycleDone} de ${CYCLE_LENGTH} bloques de foco del ciclo`}
        >
          {Array.from({ length: CYCLE_LENGTH }, (_, i) => (
            <span
              key={i}
              className="h-1 w-6 rounded-xs"
              style={{ background: i < cycleDone ? "var(--gr-gilded)" : "var(--gr-edge)" }}
            />
          ))}
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
