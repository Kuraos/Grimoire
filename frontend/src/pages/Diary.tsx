import { useCallback, useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconSearch, IconEye, IconPencil, IconFileExport } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { MiniCalendar, MONTHS_ES } from "../components/ui/MiniCalendar";
import { TagInput } from "../components/ui/TagInput";
import { useAutoSave } from "../hooks/useAutoSave";
import { isoDate, todayISO, renderMarkdown, fmtTime } from "../utils";
import type { DaySummary } from "../types";

export default function Diary() {
  const { refreshUser, pushToast } = useApp();
  const [date, setDate] = useState(todayISO());
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ entry_date: string; content: string }[]>([]);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [calCursor, setCalCursor] = useState(new Date());

  const save = useCallback(async (v: string) => {
    await Api.saveDiary(date, v);
    refreshUser();
    Api.diaryDates().then((ds) => setMarked(new Set(ds))).catch(() => {});
  }, [date, refreshUser]);

  const { status, savedAt, saveNow, markSaved } = useAutoSave(content, save);

  const loadEntry = useCallback(async (d: string) => {
    setLoaded(false);
    try {
      const [entry, sum] = await Promise.all([Api.getDiary(d), Api.daySummary(d)]);
      setContent(entry.content);
      markSaved(entry.content); // freshly loaded content is the new baseline
      setTags(entry.tags ?? "");
      setSummary(sum);
    } catch {
      setContent("");
    } finally {
      setLoaded(true);
    }
  }, [markSaved]);

  useEffect(() => {
    loadEntry(date);
  }, [date, loadEntry]);

  useEffect(() => {
    Api.diaryDates().then((ds) => setMarked(new Set(ds))).catch(() => {});
  }, []);

  // flush queued edits for the CURRENT date before switching away from it
  const goToDate = useCallback(async (d: string) => {
    await saveNow();
    setDate(d);
  }, [saveNow]);

  // search (debounced lightly)
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(() => Api.searchDiary(search).then(setResults).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [search]);

  const move = (delta: number) => {
    const d = new Date(date + "T00:00");
    d.setDate(d.getDate() + delta);
    goToDate(isoDate(d));
  };

  const exportObsidian = async () => {
    await saveNow(); // ensure the latest content is persisted before exporting
    try {
      const res = await Api.exportDiaryObsidian(date);
      pushToast({ title: "Exportado a Obsidian", body: res.path, icon: "book" });
    } catch {
      /* the API client surfaces the backend error message as a toast */
    }
  };

  const statusLabel =
    status === "pending" ? "Cambios sin guardar…" :
    status === "saving" ? "Guardando…" :
    status === "saved" ? `Guardado · ${savedAt ? fmtTime(savedAt.toISOString()) : ""}` : "Sin cambios";

  const marks: Record<string, string[]> = {};
  marked.forEach((d) => { marks[d] = ["var(--gr-arcane)"]; });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex items-center gap-2 lg:col-span-3">
        <h1 className="gr-title-module">Diario</h1>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn" onClick={() => move(-1)}><IconChevronLeft size={14} /></button>
          <span className="px-2 font-label text-xs tabular text-[var(--text-body)]">{date}</span>
          <button className="btn" onClick={() => move(1)}><IconChevronRight size={14} /></button>
        </div>
      </div>

      <div className="space-y-2 lg:col-span-2">
        <Card right={
          <div className="flex items-center gap-2">
            <span className="text-xs italic text-[var(--text-muted)]">{statusLabel}</span>
            <button className="btn" onClick={() => setPreview(!preview)}>
              {preview ? <><IconPencil size={12} /> Editar</> : <><IconEye size={12} /> Vista</>}
            </button>
            <button className="btn" onClick={exportObsidian} title="Escribe {vault}/06-Diario/{fecha}.md">
              <IconFileExport size={12} /> Exportar a Obsidian
            </button>
          </div>
        } title="Entrada del día">
          {!loaded ? (
            <p className="text-xs text-[var(--text-muted)]">Cargando…</p>
          ) : preview ? (
            <div className="prose-diary font-prose min-h-[300px] text-[var(--text-body)]"
                 dangerouslySetInnerHTML={{ __html: renderMarkdown(content) || "<p style='color:var(--gr-ink-dim)'>Nada escrito.</p>" }} />
          ) : (
            <textarea
              className="input font-prose min-h-[300px] resize-y"
              placeholder="Escribe tu día… (Markdown: **negrita**, *cursiva*, - listas)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => saveNow()}
            />
          )}
          <div className="mt-2">
            <div className="mb-1 font-label text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Etiquetas</div>
            <TagInput value={tags} onChange={(v) => { setTags(v); Api.saveDiary(date, content, v).catch(() => {}); }} />
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <Card title="Resumen del día">
          {summary ? (
            <div className="space-y-2 text-xs text-[var(--text-body)]">
              <Row label="XP ganado" value={`${summary.xp_earned}`} />
              <Row label="Hábitos" value={`${summary.habits_done.length}`} />
              <Row label="Pomodoro" value={`${summary.pomodoro_sessions.length} ses · ${summary.pomodoro_minutes}m`} />
              <Row label="Energía / Ánimo" value={summary.checkin ? `${summary.checkin.energy}/5 · ${summary.checkin.mood}/5` : "—"} />
              {summary.habits_done.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {summary.habits_done.map((h, i) => (
                    <span key={i} className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--bg-elevated)", color: h.color }}>{h.name}</span>
                  ))}
                </div>
              )}
            </div>
          ) : <p className="text-xs text-[var(--text-muted)]">—</p>}
        </Card>

        <Card title={`${MONTHS_ES[calCursor.getMonth()]} ${calCursor.getFullYear()}`}>
          <MiniCalendar month={calCursor.getMonth()} year={calCursor.getFullYear()} marks={marks} selected={date} onSelect={goToDate} />
        </Card>

        <Card title="Buscar" icon={<IconSearch size={13} />}>
          <input className="input" placeholder="Buscar en entradas…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="mt-2 max-h-48 overflow-y-auto">
            {results.map((r) => (
              <button key={r.entry_date} onClick={() => goToDate(r.entry_date)}
                className="block w-full border-b border-[var(--gr-edge)] py-1.5 text-left last:border-none">
                <div className="font-label text-xs text-[var(--purple-main)]">{r.entry_date}</div>
                <div className="truncate text-xs text-[var(--text-muted)]">{r.content.slice(0, 60)}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular text-[var(--text-primary)]">{value}</span>
    </div>
  );
}
