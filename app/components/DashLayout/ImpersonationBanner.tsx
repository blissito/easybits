import { Form } from "react-router";

/**
 * Persistent top banner shown across the whole dash while impersonating a
 * client ("operar como"). The "Salir" form posts to /dash/cuentas (intent
 * clear) — works from any page. Driven by the REAL operator, outside any
 * admin gate, so the operator can always exit.
 */
export function ImpersonationBanner({
  asEmail,
  asName,
}: {
  asEmail: string;
  asName?: string | null;
}) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-yellow-300 border-b-2 border-black px-4 py-1.5 flex items-center justify-center gap-3 text-sm">
      <span className="text-black truncate">
        Operando como <strong>{asName || asEmail}</strong>
      </span>
      <Form method="post" action="/dash/cuentas">
        <input type="hidden" name="intent" value="clear" />
        <button className="border-2 border-black rounded-lg px-2.5 py-0.5 bg-black text-white font-medium hover:opacity-80">
          Salir
        </button>
      </Form>
    </div>
  );
}
