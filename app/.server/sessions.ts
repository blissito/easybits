import { createCookie, createCookieSessionStorage } from "react-router";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required");

export const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: "__session",
      maxAge: 3600 * 24 * 7 * 4,
      path: "/",
      sameSite: "lax",
      secrets: [JWT_SECRET],
    },
  });

export const redirectCookie = createCookie("next", {
  maxAge: 3600, // one hour
  // secrets: ["blissmo", "easybits.cloud"],
});
