import { useCallback, useEffect, useRef, useState } from "react";

export type Phase = "work" | "short" | "long";

export interface PomodoroConfig {
  work: number; // minutes
  short: number;
  long: number;
}

export const DEFAULT_CONFIG: PomodoroConfig = { work: 25, short: 5, long: 15 };

function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.32);
    osc.onended = () => ctx.close();
  } catch {
    /* audio not available */
  }
}

export function usePomodoro(config: PomodoroConfig, onWorkComplete: (minutes: number) => void) {
  const [phase, setPhase] = useState<Phase>("work");
  const [secondsLeft, setSecondsLeft] = useState(config.work * 60);
  const [running, setRunning] = useState(false);
  const [workCount, setWorkCount] = useState(0);
  const tick = useRef<number | null>(null);

  const phaseMinutes = useCallback(
    (p: Phase) => (p === "work" ? config.work : p === "short" ? config.short : config.long),
    [config]
  );

  // reset timer when config changes and not running
  useEffect(() => {
    if (!running) setSecondsLeft(phaseMinutes(phase) * 60);
  }, [config, phase, phaseMinutes, running]);

  const advance = useCallback(
    (current: Phase) => {
      if (current === "work") {
        onWorkComplete(config.work);
        const nextCount = workCount + 1;
        setWorkCount(nextCount);
        const next: Phase = nextCount % 4 === 0 ? "long" : "short";
        setPhase(next);
        setSecondsLeft(phaseMinutes(next) * 60);
      } else {
        setPhase("work");
        setSecondsLeft(config.work * 60);
      }
    },
    [config.work, onWorkComplete, phaseMinutes, workCount]
  );

  // countdown
  useEffect(() => {
    if (!running) {
      if (tick.current) window.clearInterval(tick.current);
      return;
    }
    tick.current = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
  }, [running]);

  // phase transition when a running timer reaches zero
  useEffect(() => {
    if (running && secondsLeft === 0) {
      playChime();
      advance(phase);
    }
  }, [running, secondsLeft, phase, advance]);

  const start = () => setRunning(true);
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setSecondsLeft(phaseMinutes(phase) * 60);
  };
  const skip = () => {
    setRunning(false);
    advance(phase);
  };

  const total = phaseMinutes(phase) * 60;
  const progress = total > 0 ? 1 - secondsLeft / total : 0;

  return { phase, secondsLeft, running, workCount, start, pause, reset, skip, progress };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
