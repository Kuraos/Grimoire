import { ReactNode } from "react";
import { IconX } from "@tabler/icons-react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: "rgba(10,8,16,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg p-5"
        style={{ background: "var(--bg-deep)", border: "1px solid var(--border-accent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center">
          <h2 className="font-display text-base text-[var(--purple-main)]">{title}</h2>
          <button onClick={onClose} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-body)]">
            <IconX size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block font-label text-xs text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}
