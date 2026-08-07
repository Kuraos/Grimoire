import {
  createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import { Api } from "./api/endpoints";
import { onConnectionChange, onApiError } from "./api/client";
import { playLevelUp } from "./sounds";
import type { User, Achievement, XPEventResponse } from "./types";

export interface Toast {
  id: number;
  achievement?: Achievement;
  title: string;
  body: string;
  icon?: string;
  variant?: "default" | "error";
}

export interface LevelUp {
  level: number;
  title: string;
}

interface AppState {
  user: User | null;
  refreshUser: () => Promise<void>;
  online: boolean;
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  levelUp: LevelUp | null;
  dismissLevelUp: () => void;
  /** handle the standard XP-event response: refresh user + maybe toast */
  handleXP: (res: XPEventResponse) => void;
}

const Ctx = createContext<AppState | null>(null);

let toastSeq = 1;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUp | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await Api.getUser());
    } catch {
      /* connection banner handles this */
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const id = setInterval(refreshUser, 30_000);
    return () => clearInterval(id);
  }, [refreshUser]);

  useEffect(() => onConnectionChange(setOnline), []);

  const dismissToast = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = toastSeq++;
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);

  // surface API/network errors as toasts (deduped to avoid spam)
  const lastErr = useRef<{ msg: string; at: number }>({ msg: "", at: 0 });
  useEffect(() => onApiError((message) => {
    const now = Date.now();
    if (lastErr.current.msg === message && now - lastErr.current.at < 4000) return;
    lastErr.current = { msg: message, at: now };
    pushToast({ title: "Error", body: message, icon: "alert-triangle", variant: "error" });
  }), [pushToast]);

  const dismissLevelUp = useCallback(() => setLevelUp(null), []);

  const handleXP = useCallback(
    (res: XPEventResponse) => {
      refreshUser();
      if (res.leveled_up) {
        setLevelUp({ level: res.new_level, title: res.title });
        playLevelUp();
        setTimeout(() => setLevelUp(null), 4200);
      }
      if (res.achievement_unlocked) {
        const a = res.achievement_unlocked;
        pushToast({ achievement: a, title: "Logro desbloqueado", body: a.name, icon: a.icon });
      }
    },
    [refreshUser, pushToast]
  );

  return (
    <Ctx.Provider value={{ user, refreshUser, online, toasts, pushToast, dismissToast, levelUp, dismissLevelUp, handleXP }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export const useUser = () => useApp().user;
