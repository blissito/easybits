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

export const redirectCookie = createCookie("next", {
  maxAge: 3600, // one hour
  // secrets: ["blissmo", "easybits.cloud"],
});
