import { createCookie, createCookieSessionStorage } from "react-router";

interface SessionData {
  email: string;
  // Impersonation: when set, the dash operates as this account ("operar como").
  // `email` always stays the real operator (for audit + exit). See getters.ts.
  actAsEmail?: string;
}

interface SessionFlashData {
  error: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret)
    throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

let _sessionStorage: ReturnType<
  typeof createCookieSessionStorage<SessionData, SessionFlashData>
>;

function getSessionStorage() {
  if (!_sessionStorage) {
    _sessionStorage = createCookieSessionStorage<SessionData, SessionFlashData>({
      cookie: {
        name: "__session",
        maxAge: 3600 * 24 * 7 * 4,
        path: "/",
        sameSite: "lax",
        secure: true,
        secrets: [getJwtSecret()],
      },
    });
  }
  return _sessionStorage;
}

export const getSession: typeof _sessionStorage.getSession = (...args) =>
  getSessionStorage().getSession(...args);
export const commitSession: typeof _sessionStorage.commitSession = (...args) =>
  getSessionStorage().commitSession(...args);
export const destroySession: typeof _sessionStorage.destroySession = (
  ...args
) => getSessionStorage().destroySession(...args);

let _redirectCookie: ReturnType<typeof createCookie>;

export function getRedirectCookie() {
  if (!_redirectCookie) {
    _redirectCookie = createCookie("next", {
      maxAge: 3600, // one hour
      secrets: [getJwtSecret()],
    });
  }
  return _redirectCookie;
}
