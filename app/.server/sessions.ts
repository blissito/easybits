import { createCookie, createCookieSessionStorage } from "react-router";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret)
    throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

let _sessionStorage: ReturnType<typeof createCookieSessionStorage>;

function getSessionStorage() {
  if (!_sessionStorage) {
    _sessionStorage = createCookieSessionStorage({
      cookie: {
        name: "__session",
        maxAge: 3600 * 24 * 7 * 4,
        path: "/",
        sameSite: "lax",
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

export const redirectCookie = createCookie("next", {
  maxAge: 3600, // one hour
  // secrets: ["blissmo", "easybits.cloud"],
});
