import { useCallback, useEffect, useState } from "react";
import {
  IconDeviceFloppy, IconDownload, IconFileTypeCsv, IconDatabase, IconRotate, IconRefresh,
} from "@tabler/icons-react";
import { Modal, Field } from "../ui/Modal";
import { Api } from "../../api/endpoints";
import { useApp } from "../../context";
import { confirm } from "../../confirm";
import { checkForUpdate, applyUpdate, isDesktop, type UpdateState } from "../../updater";
import type { Update } from "@tauri-apps/plugin-updater";
import type { BackupEntry } from "../../types";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, refreshUser, pushToast } = useApp();
  const [vaultPath, setVaultPath] = useState(user?.obsidian_vault_path ?? "");
  const [saving, setSaving] = useState(false);
  /* El campo se fijaba una sola vez, en el primer render. Abierto antes de que
     `user` hubiera llegado —arranque en frío, con el sidecar todavía
     levantándose— salía vacío, y «Guardar ruta» persistía ese vacío: la ruta del
     vault se borraba por haber abierto Ajustes demasiado pronto. Lo tecleado
     manda en cuanto se toca. */
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setVaultPath(user?.obsidian_vault_path ?? "");
  }, [user, touched]);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupDir, setBackupDir] = useState("");
  const [busy, setBusy] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      const r = await Api.listBackups();
      setBackups(r.backups);
      setBackupDir(r.dir);
    } catch { /* el cliente ya avisa */ }
  }, []);
  useEffect(() => { loadBackups(); }, [loadBackups]);

  const save = async () => {
    setSaving(true);
    try {
      await Api.updateUser({ obsidian_vault_path: vaultPath.trim() });
      await refreshUser();
      pushToast({ title: "Ajustes", body: "Configuración guardada", icon: "settings" });
      onClose();
    } catch { /* el cliente ya avisa */ } finally { setSaving(false); }
  };

  const createBackup = async () => {
    setBusy(true);
    try {
      const r = await Api.createBackup();
      pushToast({ title: "Respaldo creado", body: `${r.created} · ${r.size_kb} KB`, icon: "database" });
      loadBackups();
    } catch { /* */ } finally { setBusy(false); }
  };

  const restore = async (b: BackupEntry) => {
    const ok = await confirm({
      title: "Restaurar respaldo",
      message: `Se reemplazarán TODOS los datos actuales por los de «${b.filename}» (${b.created_at.replace("T", " ")}). ` +
               `Antes se guardará una copia del estado actual, así que la operación es reversible. ` +
               `Tendrás que reiniciar Grimoire al terminar.`,
      confirmLabel: "Restaurar",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await Api.restoreBackup(b.filename);
      pushToast({ title: "Respaldo restaurado", body: `Reinicia Grimoire. Copia previa: ${r.safety_copy}`, icon: "database" });
      loadBackups();
    } catch { /* */ } finally { setBusy(false); }
  };

  // ---------------- Actualizaciones (sólo escritorio) ----------------
  const [upd, setUpd] = useState<UpdateState>({ phase: "idle" });
  const [pending, setPending] = useState<Update | null>(null);
  const [appVersion, setAppVersion] = useState("");

  const runCheck = useCallback(async () => {
    setUpd({ phase: "checking" });
    try {
      const u = await checkForUpdate();
      setPending(u);
      setUpd(u ? { phase: "available", version: u.version, notes: u.body } : { phase: "uptodate" });
    } catch (e) {
      setUpd({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (!isDesktop()) return;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then(setAppVersion)
      .catch(() => { /* sin versión: el resto sigue funcionando */ });
    runCheck();
  }, [runCheck]);

  const installUpdate = async () => {
    if (!pending) return;
    const ok = await confirm({
      title: "Instalar actualización",
      message: `Se descargará Grimoire ${pending.version} y la aplicación se reiniciará. ` +
               `Tus datos no se tocan: viven en %APPDATA%\\Grimoire, fuera de lo que el instalador reemplaza.`,
      confirmLabel: "Instalar y reiniciar",
    });
    if (!ok) return;
    try {
      await applyUpdate(pending, setUpd);
    } catch (e) {
      setUpd({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const updBusy = upd.phase === "checking" || upd.phase === "downloading" || upd.phase === "installing";

  const download = (kind: "json" | "db") => {
    // descarga directa: deja que el navegador/webview guarde el archivo
    const a = document.createElement("a");
    a.href = Api.backupDownloadUrl(kind);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Modal title="Ajustes" onClose={onClose}>
      <Field label="Ruta del vault de Obsidian">
        <input
          className="input"
          value={vaultPath}
          onChange={(e) => { setTouched(true); setVaultPath(e.target.value); }}
          placeholder="C:\Users\tu\Documentos\MiVault"
        />
      </Field>
      <p className="text-xs italic text-[var(--text-muted)]">
        Ruta de la carpeta del vault en esta misma máquina. Grimoire escribirá las
        entradas exportadas en <span className="text-[var(--text-body)]">{"{vault}/06-Diario/"}</span>.
      </p>
      <div className="mt-3 flex justify-end">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          <IconDeviceFloppy size={13} /> Guardar ruta
        </button>
      </div>

      {/* ---------------- Respaldo ---------------- */}
      <div className="mt-5 border-t border-[var(--gr-edge)] pt-4">
        <h3 className="gr-title-card mb-1">Respaldo de datos</h3>
        <p className="mb-3 text-xs text-[var(--text-muted)]">
          Grimoire guarda una copia automática al abrir, una por día, conservando las
          últimas 7. Aquí puedes crear una manual o descargar tus datos.
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={createBackup} disabled={busy}>
            <IconDatabase size={13} /> Respaldar ahora
          </button>
          <button className="btn" onClick={() => download("db")} disabled={busy}
                  title="Copia exacta de la base; se restaura sustituyendo el archivo">
            <IconDownload size={13} /> Descargar .db
          </button>
          <button className="btn" onClick={() => download("json")} disabled={busy}
                  title="Volcado legible de todas las tablas, por si el .db no abriera">
            <IconFileTypeCsv size={13} /> Descargar JSON
          </button>
        </div>

        {backupDir && (
          <p className="mt-2 break-all text-xs text-[var(--text-faint)]">
            Carpeta: {backupDir}
          </p>
        )}

        <div className="mt-3 max-h-40 overflow-y-auto">
          {backups.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">Aún no hay respaldos.</p>
          )}
          {backups.map((b) => (
            <div key={b.filename}
                 className="flex items-center gap-2 border-b border-[var(--gr-edge)] py-1.5 last:border-none">
              <span
                className="rounded-full px-1.5 py-[1px] text-xs"
                style={{
                  color: b.kind === "auto" ? "var(--gr-ink-dim)" : "var(--gr-gilded)",
                  border: `1px solid ${b.kind === "auto" ? "var(--gr-edge-strong)" : "var(--gr-gilded)"}`,
                }}
              >
                {b.kind === "auto" ? "auto" : "manual"}
              </span>
              <span className="flex-1 truncate text-xs tabular text-[var(--text-body)]">
                {b.created_at.replace("T", " ")}
              </span>
              <span className="tabular text-xs text-[var(--text-faint)]">{b.size_kb} KB</span>
              <button className="text-[var(--text-faint)] hover:text-[var(--gr-arcane)]"
                      title="Restaurar este respaldo" disabled={busy}
                      onClick={() => restore(b)}>
                <IconRotate size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- Actualizaciones ---------------- */}
      {isDesktop() && (
        <div className="mt-5 border-t border-[var(--gr-edge)] pt-4">
          <h3 className="gr-title-card mb-1">Actualizaciones</h3>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Grimoire busca una versión nueva al abrir. Cada actualización se verifica
            con firma criptográfica antes de instalarse; si la firma no cuadra, se descarta.
            {appVersion && (
              <> Versión instalada:{" "}
                <span className="tabular text-[var(--text-body)]">{appVersion}</span>.</>
            )}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" onClick={runCheck} disabled={updBusy}>
              <IconRefresh size={13} /> Buscar actualizaciones
            </button>
            {upd.phase === "available" && (
              <button className="btn btn-primary" onClick={installUpdate}>
                <IconDownload size={13} /> Instalar {upd.version} y reiniciar
              </button>
            )}
          </div>

          <div className="mt-2 text-xs">
            {upd.phase === "checking" && (
              <span className="text-[var(--text-muted)]">Consultando…</span>
            )}
            {upd.phase === "uptodate" && (
              <span className="text-[var(--text-muted)]">Estás en la última versión.</span>
            )}
            {upd.phase === "available" && upd.notes && (
              <p className="whitespace-pre-line text-[var(--text-muted)]">{upd.notes}</p>
            )}
            {upd.phase === "downloading" && (
              <span className="text-[var(--gr-gilded)]">
                Descargando{upd.percent !== null ? ` — ${upd.percent}%` : "…"}
              </span>
            )}
            {upd.phase === "installing" && (
              <span className="text-[var(--gr-gilded)]">Instalando y reiniciando…</span>
            )}
            {upd.phase === "error" && (
              <span className="text-[var(--danger)]">No se pudo comprobar: {upd.message}</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button className="btn" onClick={onClose}>Cerrar</button>
      </div>
    </Modal>
  );
}
