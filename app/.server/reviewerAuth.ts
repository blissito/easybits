import crypto from "node:crypto";
import { db } from "./db";

// Acceso con contraseña SÓLO para cuentas de revisión (revisores del directorio de Claude no
// tienen Google ni buzón nuestro). Una cuenta normal no tiene `reviewerPasswordHash`, así que
// este camino no le abre nada. Formato: `scrypt$<salt b64>$<hash b64>`.

export function hashReviewerPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function verify(password: string, stored: string): boolean {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** El correo de la cuenta si la contraseña es la de revisor; null en cualquier otro caso. */
export async function verifyReviewerLogin(email: string, password: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { email: true, reviewerPasswordHash: true },
  });
  // Se calcula scrypt aunque no exista la cuenta: mismo tiempo de respuesta.
  const stored = user?.reviewerPasswordHash ?? "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const ok = verify(password, stored);
  return ok && user?.reviewerPasswordHash ? user.email : null;
}
