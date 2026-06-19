import { unsubscribeContact } from "~/.server/core/contactOperations";
import type { Route } from "./+types/u.unsubscribe";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const email = token ? await unsubscribeContact(token) : null;
  return { email, ok: !!email };
};

export const meta = () => [
  { title: "Cancelar suscripción · EasyBits" },
  { name: "robots", content: "noindex" },
];

export default function Unsubscribe({ loaderData }: Route.ComponentProps) {
  const { ok, email } = loaderData;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 440,
          textAlign: "center",
          border: "2px solid #000",
          borderRadius: 16,
          padding: 32,
        }}
      >
        {ok ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Suscripción cancelada
            </h1>
            <p style={{ color: "#555" }}>
              {email} ya no recibirá más correos de esta lista.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Enlace inválido
            </h1>
            <p style={{ color: "#555" }}>
              No pudimos procesar tu baja. El enlace puede haber expirado.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
