import { useEffect, useState } from "react";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import type { WeekSummary, WeeklyReview as Review } from "../types";

export default function WeeklyReview() {
  const { handleXP } = useApp();
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [whatWorked, setWhatWorked] = useState("");
  const [whatFailed, setWhatFailed] = useState("");
  const [nextChange, setNextChange] = useState("");
  const [rating, setRating] = useState(3);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const [s, h] = await Promise.all([Api.weekSummary(), Api.listReviews()]);
      setSummary(s);
      setHistory(h);
      const current = h.find((r) => r.week_iso === s.week_iso);
      if (current) {
        setWhatWorked(current.what_worked ?? "");
        setWhatFailed(current.what_failed ?? "");
        setNextChange(current.next_change ?? "");
        setRating(current.rating ?? 3);
        setSaved(true);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      const res = await Api.saveReview({
        week_iso: summary?.week_iso,
        what_worked: whatWorked,
        what_failed: whatFailed,
        next_change: nextChange,
        rating,
      });
      handleXP(res);
      setSaved(true);
      load();
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="gr-title-module">Revisión semanal</h1>
        {summary && <span className="font-label text-xs text-[var(--text-muted)]">{summary.week_iso}</span>}
        {saved && <span className="text-xs italic text-[var(--success)]">✓ Completada</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Resumen automático">
          {summary ? (
            <div className="space-y-2 text-xs text-[var(--text-body)]">
              <Row label="XP esta semana" value={`${summary.xp_total}`}
                   delta={summary.xp_delta_pct} />
              <Row label="Hábitos" value={`${summary.habits_completed} / ${summary.habits_possible}`} />
              <Row label="Foco" value={`${summary.pomodoro_minutes}m · ${summary.pomodoro_sessions} sesiones`} />
              <Row label="Tareas cerradas / abiertas" value={`${summary.tasks_closed} / ${summary.tasks_open}`} />
              <Row label="Energía media" value={summary.avg_energy ? `${summary.avg_energy}/5` : "—"} />
              <Row label="Ánimo medio" value={summary.avg_mood ? `${summary.avg_mood}/5` : "—"} />
            </div>
          ) : <p className="text-xs text-[var(--text-muted)]">Cargando…</p>}
        </Card>

        <Card title="Reflexión guiada">
          <Question label="¿Qué funcionó bien esta semana?" value={whatWorked} onChange={setWhatWorked} />
          <Question label="¿Qué no funcionó o quedó pendiente?" value={whatFailed} onChange={setWhatFailed} />
          <Question label="¿Qué cambio concreto haré la semana que viene?" value={nextChange} onChange={setNextChange} />
          <div className="mb-3">
            <span className="mb-1 block font-label text-xs text-[var(--text-muted)]">Rating de la semana</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} className="text-[var(--purple-main)]">
                  {n <= rating ? <IconStarFilled size={20} /> : <IconStar size={20} className="text-[var(--text-faint)]" />}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary w-full justify-center" onClick={save}>
            {saved ? "Actualizar revisión" : "Guardar revisión (+30 XP)"}
          </button>
        </Card>
      </div>

      <Card title="Historial">
        {history.length === 0 && <p className="text-xs text-[var(--text-muted)]">Sin revisiones previas.</p>}
        {history.map((r) => (
          <div key={r.id} className="border-b border-[var(--gr-edge)] py-2 last:border-none">
            <div className="flex items-center gap-2">
              <span className="font-label text-xs text-[var(--purple-main)]">{r.week_iso}</span>
              <span className="flex text-[var(--purple-main)]">
                {Array.from({ length: r.rating ?? 0 }).map((_, i) => <IconStarFilled key={i} size={11} />)}
              </span>
              <span className="ml-auto text-xs text-[var(--text-faint)]">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.what_worked && <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{r.what_worked}</p>}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Row({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular text-[var(--text-primary)]">
        {value}
        {delta != null && (
          <span className={`ml-2 text-xs ${delta >= 0 ? "text-[var(--success)]" : "text-[var(--gr-oxblood)]"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
      </span>
    </div>
  );
}

function Question({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block font-label text-xs text-[var(--text-muted)]">{label}</span>
      <textarea className="input font-prose" rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
