import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToasterContextValue {
  toasts: Toast[];
  toast: (opts: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToasterContext = typeof window !== "undefined"
  ? require("react").createContext<ToasterContextValue>({ toasts: [], toast: () => {}, dismiss: () => {} })
  : null;

let listeners: Array<(toasts: Toast[]) => void> = [];
let toastList: Toast[] = [];

function emitChange() {
  for (const l of listeners) {
    l([...toastList]);
  }
}

export function toaster() {
  const id = Math.random().toString(36).slice(2);
  const toast: Toast = { id, type: "info", title: "" };

  const show = (opts: Omit<Toast, "id">) => {
    const t = { ...opts, id };
    toastList = [t, ...toastList].slice(0, 5);
    emitChange();
    setTimeout(() => {
      toastList = toastList.filter((x) => x.id !== id);
      emitChange();
    }, 4000);
  };

  return {
    toast: (opts: Omit<Toast, "id">) => show(opts),
    dismiss: (id: string) => {
      toastList = toastList.filter((x) => x.id !== id);
      emitChange();
    },
  };
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  const bg: Record<ToastType, string> = {
    success: "bg-emerald-900 border-emerald-600",
    error: "bg-red-900 border-red-600",
    warning: "bg-yellow-900 border-yellow-600",
    info: "bg-slate-800 border-slate-600",
  };

  const icon: Record<ToastType, string> = {
    success: "✓",
    error: "✗",
    warning: "⚠",
    info: "ℹ",
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 rounded-lg border p-4 shadow-xl animate-in slide-in-from-right ${bg[t.type]}`}
        >
          <span className="text-lg">{icon[t.type]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{t.title}</p>
            {t.message && (
              <p className="text-xs text-slate-400 mt-0.5">{t.message}</p>
            )}
          </div>
          <button
            onClick={() => toaster().dismiss(t.id)}
            className="text-slate-400 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export { toaster };
