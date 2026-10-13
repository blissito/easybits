import { Form, data, redirect, useLoaderData } from "react-router";
import { BrandLogo } from "~/components/common/BrandLogo";
import { BrutalButton } from "~/components/common/BrutalButton";
import { db } from "~/.server/db";
import { getUserOrNull } from "~/.server/getters";
import { BASE_URL, isOwnResource, randomToken, sha256 } from "~/.server/oauth";
import { FIRST_PARTY_CLIENTS, findOAuthClient, isRedirectAllowed } from "~/.server/oauthClients";

// GET /oauth/authorize — OAuth 2.1 authorization endpoint (PKCE S256 obligatorio).
//
// Sin sesión → /login?next=<misma url>. Con sesión:
//   • cliente de casa (CLI `easybits`): se aprueba solo, como siempre;
//   • cualquier otro (registrado por DCR: Claude, Claude Code, MCP Inspector…): pantalla
//     de consentimiento que dice qué aplicación es y a qué dominio regresa. Sin ella,
//     cualquier sitio podría registrarse y sacar un token de quien tenga sesión abierta.
//
// `resource` (RFC 8707) se valida aquí y en /oauth/token: sólo emitimos para nosotros.

export const meta = () => [
  { title: "Conectar una aplicación — EasyBits" },
  { name: "robots", content: "noindex" },
];

type Params = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
};

function readParams(source: URLSearchParams | FormData): Params | null {
  const get = (k: string) => {
    const v = source.get(k);
    return typeof v === "string" ? v : "";
  };
  const params = {
    clientId: get("client_id"),
    redirectUri: get("redirect_uri"),
    codeChallenge: get("code_challenge"),
    codeChallengeMethod: get("code_challenge_method") || "S256",
    state: get("state"),
    scope: get("scope") || "mcp",
  };
  if (!params.clientId || !params.redirectUri || !params.codeChallenge) return null;
  return params;
}

// Error ANTES de confiar en el redirect: se pinta aquí con su 400. (Un `Response.json`
// devuelto desde el loader de una ruta con componente salía como 500 «Unexpected Server Error».)
function errorPage(error: string, description: string) {
  return data({ oauthError: error, description }, { status: 400 });
}

/** Valida cliente, redirect, PKCE y resource. Devuelve el error o el cliente. */
async function validate(params: Params | null, responseType: string | null, resource: string | null) {
  if (!params || responseType !== "code") {
    return { error: errorPage("invalid_request", "Faltan parámetros o response_type no es «code».") };
  }
  if (params.codeChallengeMethod !== "S256") {
    return { error: errorPage("invalid_request", "Sólo se acepta PKCE S256.") };
  }
  const client = await findOAuthClient(params.clientId);
  if (!client) return { error: errorPage("invalid_client", "Esta aplicación no está registrada.") };
  if (!isRedirectAllowed(client.redirectUris, params.redirectUri)) {
    return { error: errorPage("invalid_redirect_uri", "La dirección de regreso no coincide con la registrada.") };
  }
  // A partir de aquí el redirect es de confianza: los errores viajan al cliente.
  if (!isOwnResource(resource)) {
    return { error: redirectBack(params, { error: "invalid_target" }) };
  }
  return { client };
}

function redirectBack(params: Params, query: Record<string, string>) {
  const url = new URL(params.redirectUri);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  if (params.state) url.searchParams.set("state", params.state);
  // RFC 9207: el cliente comprueba que el code (o el error) viene de este servidor.
  url.searchParams.set("iss", BASE_URL);
  return redirect(url.toString());
}

async function issueCode(params: Params, userId: string) {
  const code = randomToken(32);
  await db.oAuthAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: params.clientId,
      userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      scope: params.scope,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min
    },
  });
  return redirectBack(params, { code });
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const params = readParams(url.searchParams);
  const checked = await validate(params, url.searchParams.get("response_type"), url.searchParams.get("resource"));
  if (checked.error) return checked.error;

  const user = await getUserOrNull(request);
  if (!user) {
    const next = encodeURIComponent(url.pathname + url.search);
    return redirect(`/login?next=${next}`);
  }

  if (params!.clientId in FIRST_PARTY_CLIENTS) return issueCode(params!, user.id);

  const target = new URL(params!.redirectUri);
  return {
    clientName: checked.client.clientName,
    returnHost: target.host,
    email: user.email,
    // Se reenvían tal cual en el POST del consentimiento.
    hidden: {
      client_id: params!.clientId,
      redirect_uri: params!.redirectUri,
      response_type: "code",
      code_challenge: params!.codeChallenge,
      code_challenge_method: params!.codeChallengeMethod,
      state: params!.state,
      scope: params!.scope,
      resource: url.searchParams.get("resource") ?? "",
    },
  };
}

export async function action({ request }: { request: Request }) {
  // CSRF: el consentimiento sólo se acepta desde nuestra propia página.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host.replace(/^www\./, "") !== new URL(BASE_URL).host.replace(/^www\./, "")) {
    return Response.json({ error: "invalid_request" }, { status: 403 });
  }
  const form = await request.formData();
  const params = readParams(form);
  const resource = String(form.get("resource") || "") || null;
  const checked = await validate(params, String(form.get("response_type") || ""), resource);
  if (checked.error) return checked.error;

  const user = await getUserOrNull(request);
  if (!user) return redirect(`/login`);

  if (form.get("decision") !== "approve") {
    return redirectBack(params!, { error: "access_denied" });
  }
  return issueCode(params!, user.id);
}

export default function OauthAuthorize() {
  const data = useLoaderData<typeof loader>() as {
    clientName: string;
    returnHost: string;
    email: string;
    hidden: Record<string, string>;
    oauthError?: string;
    description?: string;
  };
  if (data.oauthError) {
    return (
      <main className="min-h-svh bg-black text-white grid place-items-center px-6 py-10">
        <div className="max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <BrandLogo size="hero" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">No se pudo conectar la aplicación</h1>
          <p className="mt-4 text-tale">{data.description}</p>
          <p className="mt-2 text-sm text-tale font-mono">{data.oauthError}</p>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-svh bg-black text-white grid place-items-center px-6 py-10">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6">
          <BrandLogo size="hero" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-center">
          {data.clientName} quiere usar tu cuenta de EasyBits
        </h1>
        <p className="mt-4 text-tale text-center">
          Es una aplicación externa. Al permitirlo podrá usar las herramientas de EasyBits
          con tu cuenta (<span className="text-white">{data.email}</span>): leer y crear
          archivos, documentos, bases de datos, sitios y cajas de cómputo, y borrar lo que
          le pidas.
        </p>
        <p className="mt-4 text-sm text-tale text-center">
          Regresarás a <span className="font-mono text-white">{data.returnHost}</span>. Puedes
          quitarle el acceso cuando quieras en tu panel de EasyBits (Developer → Claude.ai →
          Apps conectadas).
        </p>
        <Form method="post" reloadDocument className="mt-8 flex flex-wrap justify-center gap-3">
          {Object.entries(data.hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <BrutalButton type="submit" name="decision" value="deny" mode="ghost">
            Cancelar
          </BrutalButton>
          <BrutalButton type="submit" name="decision" value="approve">
            Permitir
          </BrutalButton>
        </Form>
      </div>
    </main>
  );
}
