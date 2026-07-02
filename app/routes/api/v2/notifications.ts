import { data } from "react-router";
import type { Route } from "./+types/notifications";
import { getUserOrRedirect } from "~/.server/getters";
import {
  listNotifications,
  countUnread,
  markNotificationsRead,
} from "~/.server/core/notificationOperations";

// GET /api/v2/notifications — the dashboard notification center (session auth).
// Returns recent notifications + unread count for the logged-in user. Fetched
// lazily by the sidebar bell popover on open.
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserOrRedirect(request);
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(user.id, { limit: 20 }),
    countUnread(user.id),
  ]);
  return data(
    { notifications, unreadCount },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/v2/notifications — intent "mark-read": mark notifications read.
// `all=1` marks every unread one; otherwise `ids` (CSV) — always scoped to the
// current user (no IDOR).
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserOrRedirect(request);
  const fd = await request.formData();
  const intent = String(fd.get("intent") || "");
  if (intent !== "mark-read") {
    return data({ error: "intent inválido" }, { status: 400 });
  }
  const all = String(fd.get("all") || "") === "1";
  const ids = String(fd.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const count = await markNotificationsRead(user.id, all ? { all: true } : { ids });
  return data({ ok: true, count });
}
