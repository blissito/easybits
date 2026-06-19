// Thin MercadoPago REST client (Checkout Pro). No SDK dependency — raw fetch.
//
// BYO model: every call takes the connected user's own access token. Money goes
// directly to their MP account; EasyBits never holds funds. The optional
// `marketplace_fee` (OAuth/marketplace, v2) is intentionally NOT used here.
//
// Ported from ~/mailmask main.ts (preference create + webhook signature).

const MP_API = "https://api.mercadopago.com";
const TIMEOUT_MS = 10_000;

export interface CreatePreferenceInput {
  token: string;
  title: string;
  amount: number; // major units (e.g. 199.00 MXN)
  currency?: string; // default MXN
  externalReference: string;
  notificationUrl: string;
  backUrl: string;
  payerEmail?: string;
}

export interface CreatePreferenceResult {
  preferenceId: string;
  initPoint: string;
}

/** Create a Checkout Pro preference → returns the shareable init_point URL. */
export async function createPreference(
  input: CreatePreferenceInput
): Promise<CreatePreferenceResult> {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      items: [
        {
          id: input.externalReference,
          title: input.title,
          quantity: 1,
          unit_price: input.amount,
          currency_id: input.currency ?? "MXN",
        },
      ],
      external_reference: input.externalReference,
      ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
      back_urls: {
        success: input.backUrl,
        failure: input.backUrl,
        pending: input.backUrl,
      },
      auto_return: "approved",
      notification_url: input.notificationUrl,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data = (await res.json()) as {
    id?: string;
    init_point?: string;
    message?: string;
  };
  if (!res.ok || !data.init_point || !data.id) {
    throw new Error(data.message || `MercadoPago error (HTTP ${res.status})`);
  }
  return { preferenceId: data.id, initPoint: data.init_point };
}

export interface MpPayment {
  status: string;
  external_reference?: string;
  payer?: { email?: string };
}

/** Fetch a payment by id using the seller's token (used to confirm webhooks). */
export async function getPayment(
  token: string,
  paymentId: string
): Promise<MpPayment> {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MercadoPago payment fetch failed (HTTP ${res.status})`);
  return (await res.json()) as MpPayment;
}

/**
 * Validate MercadoPago webhook signature (`x-signature` / `x-request-id`).
 * Returns true when no secret is configured (BYO users may skip it — the
 * webhook handler also re-fetches the payment via the seller token as the
 * authoritative check). Manifest format per MP docs:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
export async function verifyMpSignature(opts: {
  secret?: string | null;
  xSignature: string;
  xRequestId: string;
  dataId: string;
}): Promise<boolean> {
  if (!opts.secret) return true;
  const parts = Object.fromEntries(
    opts.xSignature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const ts = parts["ts"] ?? "";
  const v1 = parts["v1"] ?? "";
  if (!ts || !v1) return false;

  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(opts.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === v1;
}
