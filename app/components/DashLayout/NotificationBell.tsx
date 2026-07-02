import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useFetcher } from "react-router";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
};

// Category → icon. Monochrome stroke SVGs (24×24) to match the sidebar's
// hand-inlined Feather-style icons. New types fall back to the generic bell.
function notifIcon(type: string): ReactNode {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "file.purged":
      return (
        <svg {...common}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
  }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<{ notifications: Notification[]; unreadCount: number }>();
  const markFetcher = useFetcher();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load the list lazily on first open (don't bloat every dashboard load).
  useEffect(() => {
    if (open && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/api/v2/notifications");
    }
  }, [open]);

  // Close on click-outside (same pattern as FoldMenu).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const notifications = fetcher.data?.notifications ?? [];
  // Server count on open (fresh), else the initial loader count; mark-read zeroes it.
  const count =
    markFetcher.state !== "idle" || markFetcher.data ? 0 : fetcher.data?.unreadCount ?? unreadCount;

  const markAllRead = () => {
    markFetcher.submit({ intent: "mark-read", all: "1" }, { method: "post", action: "/api/v2/notifications" });
  };

  return (
    <div ref={wrapRef} className="relative w-full flex justify-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notificaciones"
        className="p-[6px] relative flex justify-center items-center hover:bg-white/15 rounded-lg text-white"
      >
        {notifIcon("bell")}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-brand-500 text-white text-[9px] font-bold leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, x: -8, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -8, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                style={{ left: "5rem", top: "0.75rem" }}
                className="fixed z-[9999] w-80 max-h-[70vh] overflow-y-auto bg-white border-2 border-black rounded-2xl shadow-xl"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
                  <h3 className="font-semibold text-sm text-black">Notificaciones</h3>
                  {notifications.some((n) => !n.read) && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[11px] font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Marcar leídas
                    </button>
                  )}
                </div>

                {fetcher.state === "loading" && !fetcher.data ? (
                  <div className="flex flex-col gap-2 p-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <p className="text-xs text-gray-400 py-8 text-center px-4">
                    No tienes notificaciones.
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {notifications.map((n) => (
                      <li
                        key={n.id}
                        className={"flex gap-3 px-4 py-3 " + (n.read ? "" : "bg-brand-50/60")}
                      >
                        <span className="shrink-0 mt-0.5 text-gray-500">{notifIcon(n.type)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-black leading-snug">{n.title}</p>
                          {n.body && (
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">{n.body}</p>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                        </div>
                        {!n.read && <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-brand-500" />}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
