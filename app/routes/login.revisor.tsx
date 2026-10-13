import { Form, redirect, useActionData, useSearchParams } from "react-router";
import { BrandLogo } from "~/components/common/BrandLogo";
import { BrutalButton } from "~/components/common/BrutalButton";
import { RateLimiter } from "~/.server/rateLimiter";
import { verifyReviewerLogin } from "~/.server/reviewerAuth";
import { commitSession, getSession } from "~/.server/sessions";

// /login/revisor — entrada con correo y contraseña SÓLO para cuentas de revisión (revisores del
// directorio de Claude). Sin enlace desde el sitio; las demás cuentas entran con Google o liga
// mágica y aquí no tienen contraseña que acertar.

export const meta = () => [
  { title: "Acceso de revisores — EasyBits" },
  { name: "robots", content: "noindex" },
];

// 10 intentos por IP cada 15 min: suficiente para un humano, inútil para fuerza bruta.
const limiter = new RateLimiter({ windowMs: 15 * 60_000, maxRequests: 10 });

/** Sólo rutas internas como destino (evita open redirect). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dash";
}

export async function action({ request }: { request: Request }) {
  const ip = limiter.getClientIP(request);
  const { allowed } = await limiter.checkRateLimit(`reviewer-login:${ip}`);
  if (!allowed) return { error: "Demasiados intentos. Espera unos minutos." };

  const form = await request.formData();
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  const next = safeNext(String(form.get("next") || ""));
  const ok = email && password ? await verifyReviewerLogin(email, password) : null;
  if (!ok) return { error: "Correo o contraseña incorrectos." };

  const session = await getSession(request.headers.get("Cookie"));
  session.set("email", ok);
  return redirect(next, { headers: { "set-cookie": await commitSession(session) } });
}

export default function ReviewerLogin() {
  const data = useActionData<typeof action>();
  const [params] = useSearchParams();
  return (
    <main className="min-h-svh bg-black text-white grid place-items-center px-6 py-10">
      <div className="max-w-sm w-full">
        <div className="flex justify-center mb-6">
          <BrandLogo size="hero" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-center">Reviewer access</h1>
        <p className="mt-2 text-sm text-tale text-center">Acceso para cuentas de revisión.</p>
        <Form method="post" className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="next" value={params.get("next") ?? ""} />
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="Email"
            className="h-12 rounded-xl border-2 border-white bg-black px-4 text-white"
          />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            className="h-12 rounded-xl border-2 border-white bg-black px-4 text-white"
          />
          {data?.error && <p className="text-sm text-red-400">{data.error}</p>}
          <BrutalButton type="submit" mode="landing">
            Sign in
          </BrutalButton>
        </Form>
      </div>
    </main>
  );
}
