import { redirect, redirect as rrRedirect, type Cookie } from "react-router";
import type { Route } from "./+types/login";
import LoginComponent from "~/components/login/login-component";
import { createStripeSession, getStripeURL } from "~/.server/stripe.getters";
import { createGoogleSession, getGoogleURL } from "~/.server/google.getters";
import {
  commitSession,
  getRedirectCookie as redirectCookieFn,
} from "~/.server/sessions";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import {
  sendConfrimation,
  sendMagicLink,
} from "~/.server/emails/sendNewsLetter";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const setRedirectCookie = async (request: Request, next: string) => {
    const cookieHeader = request.headers.get("Cookie");
    const cookie = (await redirectCookieFn().parse(cookieHeader)) || {};
    cookie["next"] = next;
    return cookie as Cookie;
  };

  const getRedirectCookie = async (request: Request) => {
    const cookieHeader = request.headers.get("Cookie");
    return (await redirectCookieFn().parse(cookieHeader)) || {};
  };

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const auth = url.searchParams.get("auth");
  const next = url.searchParams.get("next") as string;

  let cookie = { next: "" } as Cookie<{ next: string }>;
  if (next) {
    // saving next
    cookie = await setRedirectCookie(request, next);
    return new Response(null, {
      headers: {
        "Set-Cookie": await redirectCookieFn().serialize(cookie),
      },
    });
  }
  // the pair to handle multiple
  let session;

  // stripe returning with code (Stripe doesn't like param:auth=stripe)
  if (code && params.success === "success") {
    session = await createStripeSession(code, request);
  }

  if (code && auth === "google") {
    session = await createGoogleSession(code, request);
    sendConfrimation(session.get("email"), { validate: true }); // @revisit
  }

  if (session) {
    cookie = await getRedirectCookie(request); // @todo revisit all this, maybe not needed
    if (cookie["next"]) {
      const next = cookie["next"];
      cookie["next"] = undefined;
      throw redirect(next, {
        headers: {
          "set-cookie": await redirectCookieFn().serialize(cookie),
          "Set-Cookie": await commitSession(session),
        },
      });
    }
  }

  return redirect("/dash");
};

export const action = async ({ request }: Route.ClientActionArgs) => {
  const formData = await request.formData();
  const auth = formData.get("auth");
  switch (auth) {
    case "stripe":
      return rrRedirect(getStripeURL());
    case "google":
      return rrRedirect(getGoogleURL());
    case "email_signup":
      const email = formData.get("email") as string;
      const displayName = formData.get("displayName") as string;
      const url = new URL(request.url);
      const next = url.searchParams.get("next");
      await sendMagicLink(email, { displayName, next });
      return { state: "success" };
    default:
      return { error: "Error" };
  }
};

export const meta = () =>
  getBasicMetaTags({
    title: "Creación de cuenta | EasyBits",
    description: "Elige tu plan y vende tu primer asset",
  });

export default function Login() {
  return <LoginComponent />;
}
