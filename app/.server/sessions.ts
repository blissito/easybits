import { createCookie, createCookieSessionStorage } from "react-router";

export const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    // @todo improve, upgrade
    cookie: {
      name: "__session",
      maxAge: 3600 * 24 * 7 * 4,
      path: "/",
      sameSite: "lax",
      secrets: [process.env.JWT_SECRET || "easyBitsByFixterorg"],
    },
  });

export const redirectCookie = createCookie("redirect", {
  maxAge: 604_800, // one week
  // secrets: ["blissmo", "easybits.cloud"],
});
