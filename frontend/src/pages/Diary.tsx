import { useCallback, useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconSearch, IconEye, IconPencil, IconFileExport } from "@tabler/icons-react";
import { Api } from "../api/endpoints";
import { useApp } from "../context";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/layout/PageHeader";
import { DiaryVolume } from "../components/charts/DiaryVolume";
import { MiniCalendar } from "../components/ui/MiniCalendar";
import { TagInput } from "../components/ui/TagInput";
import { useAutoSave } from "../hooks/useAutoSave";
import { isoDate, todayISO, renderMarkdown, fmtTime, MONTHS_ES } from "../utils";
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

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    /* 1.9 : 1 y no 2 : 1. La columna de escritura tiene que ganar sin dejar la
       de contexto en una tira: con dos tercios exactos, el minicalendario y el
       volumen se estrechaban por debajo de lo que necesitan. */
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.9fr_1fr]">
      <PageHeader
        title="Diario"
        className="lg:col-span-2"
        context={`${words} palabra${words === 1 ? "" : "s"} · ${marked.size} entrada${marked.size === 1 ? "" : "s"} en el volumen`}
      >
        <button className="btn" onClick={() => move(-1)}><IconChevronLeft size={14} /></button>
        <span className="px-2 font-label text-xs tabular text-[var(--text-body)]">{date}</span>
        <button className="btn" onClick={() => move(1)}><IconChevronRight size={14} /></button>
      </PageHeader>

      <Card rank="rubric" className="flex flex-col">
        <div className="gr-sangrado flex items-center gap-2">
          <span className="gr-rubrica">Entrada del día</span>
          <span className="h-px flex-1 bg-[var(--gr-edge)]" />
          <span className="text-xs italic text-[var(--text-faint)]">{statusLabel}</span>
          <button className="btn" onClick={() => setPreview(!preview)}>
            {preview ? <><IconPencil size={12} /> Editar</> : <><IconEye size={12} /> Vista</>}
          </button>
          <button className="btn" onClick={exportObsidian} title="Escribe {vault}/06-Diario/{fecha}.md">
            <IconFileExport size={12} /> Exportar a Obsidian
          </button>
          <span className="gr-rombo" />
        </div>

        <div className="mt-4 gr-sangrado">
          {!loaded ? (
            <p className="text-xs text-[var(--text-muted)]">Cargando…</p>
          ) : preview ? (
            /* La capitular vive sólo aquí. El Diario es la única vista con prosa
               de verdad, y una inicial de 62px repetida deja de ser una inicial.
               Va en la vista renderizada y no en el textarea a propósito: al
               escribir, una letra flotada de tres líneas mueve el cursor. */
            <div className="prose-diary gr-prosa min-h-[340px]"
                 dangerouslySetInnerHTML={{ __html: renderMarkdown(content) || "<p style='color:var(--gr-ink-dim)'>Nada escrito.</p>" }} />
          ) : (
            <textarea
              className="input font-prose min-h-[340px] resize-y bg-[var(--gr-surface-sunken)] text-[17px] leading-[1.7]"
              placeholder="Escribe tu día… (Markdown: **negrita**, *cursiva*, - listas)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => saveNow()}
            />
          )}
        </div>

        {/* El pie de la entrada: dos filetes con un rombo en medio. Cierra la
            página escrita antes de las etiquetas, que son metadato y no texto. */}
        <div className="mt-auto gr-sangrado pt-4">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="h-px flex-1 bg-[var(--gr-edge)]" />
            <span className="gr-rombo" />
            <span className="h-px flex-1 bg-[var(--gr-edge)]" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-label text-xs text-[var(--text-muted)]">Etiquetas</span>
            <TagInput value={tags} onChange={(v) => { setTags(v); Api.saveDiary(date, content, v).catch(() => {}); }} />
          </div>
        </div>
      </Card>

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

        <Card title="Buscar en el volumen" icon={<IconSearch size={13} />}>
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

        <DiaryVolume today={date} />
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
