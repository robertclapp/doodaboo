"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle, Info, X, AlertTriangle } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";

// ── Toast ────────────────────────────────────────────────────────────────────

type ToastVariant = "info" | "success" | "warning" | "error";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  ttl: number;
}

interface ToastApi {
  show: (message: string, variant?: ToastVariant, ttl?: number) => void;
  success: (message: string, ttl?: number) => void;
  error: (message: string, ttl?: number) => void;
  info: (message: string, ttl?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

// ── Confirm ─────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info", ttl = 3500) => {
      const id = ++idRef.current;
      setToasts((cur) => [...cur, { id, message, variant, ttl }]);
      if (ttl > 0) {
        setTimeout(() => dismiss(id), ttl);
      }
    },
    [dismiss],
  );

  const toast = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, t) => show(m, "success", t),
      error: (m, t) => show(m, "error", t ?? 6000),
      info: (m, t) => show(m, "info", t),
    }),
    [show],
  );

  // Confirm state
  const [pending, setPending] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        setPending({ opts, resolve });
      }),
    [],
  );

  const settle = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <ToastContext.Provider value={toast}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <ToastStack toasts={toasts} onDismiss={dismiss} />
        <Modal
          open={!!pending}
          onClose={() => settle(false)}
          title={pending?.opts.title ?? "Confirm"}
          widthClass="max-w-md"
          footer={
            <>
              <Button variant="ghost" onClick={() => settle(false)}>
                {pending?.opts.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={pending?.opts.destructive ? "danger" : "accent"}
                onClick={() => settle(true)}
                autoFocus
              >
                {pending?.opts.confirmLabel ??
                  (pending?.opts.destructive ? "Delete" : "Confirm")}
              </Button>
            </>
          }
        >
          {pending?.opts.message ? (
            <p className="text-sm text-ink/80">{pending.opts.message}</p>
          ) : (
            <p className="text-sm text-ink/80">Are you sure?</p>
          )}
        </Modal>
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { icon, accent } = ICONS[toast.variant];

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      className="border-[1.5px] border-ink bg-paper shadow-brutal-sm flex items-start gap-2 p-3 transition-all"
      style={{
        transform: entered ? "translateX(0)" : "translateX(110%)",
        opacity: entered ? 1 : 0,
      }}
    >
      <span
        className="inline-flex items-center justify-center w-6 h-6 border-[1.5px] border-ink shrink-0"
        style={{ backgroundColor: accent }}
      >
        {icon}
      </span>
      <div className="flex-1 text-sm leading-snug pt-0.5">{toast.message}</div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="p-1 hover:bg-ink hover:text-paper transition-colors shrink-0"
      >
        <X size={11} />
      </button>
    </div>
  );
}

const ICONS: Record<ToastVariant, { icon: React.ReactNode; accent: string }> = {
  info: { icon: <Info size={12} />, accent: "var(--paper-soft-hex)" },
  success: { icon: <CheckCircle size={12} />, accent: "#c4f000" },
  warning: { icon: <AlertTriangle size={12} />, accent: "#f59e0b" },
  error: { icon: <AlertTriangle size={12} />, accent: "#dc2626" },
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return ctx;
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ToastProvider>");
  }
  return ctx;
}
