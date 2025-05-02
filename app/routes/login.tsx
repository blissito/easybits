import { redirect, redirect as rrRedirect, type Cookie } from "react-router";
import type { Route } from "./+types/login";
import LoginComponent from "~/components/login/login-component";
import { createStripeSession, getStripeURL } from "~/.server/stripe.getters";
import { createGoogleSession, getGoogleURL } from "~/.server/google.getters";
import { commitSession, redirectCookie } from "~/.server/sessions";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { sendMagicLink } from "~/.server/emails/sendNewsLetter";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const setRedirectCookie = async (request: Request, next: string) => {
    const cookieHeader = request.headers.get("Cookie");
    const cookie = (await redirectCookie.parse(cookieHeader)) || {};
    cookie["next"] = next;
    return cookie as Cookie;
  };

  const clearRedirectCookie = async (request: Request) => {
    const cookieHeader = request.headers.get("Cookie");
    const cookie = (await redirectCookie.parse(cookieHeader)) || {};
    cookie["next"] = undefined;
    return cookie as Cookie;
  };

  const getRedirectCookie = async (request: Request) => {
    const cookieHeader = request.headers.get("Cookie");
    return (await redirectCookie.parse(cookieHeader)) || {};
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
        "Set-Cookie": await redirectCookie.serialize(cookie),
      },
    });
  }
  // the pair to handle multiple
  let session;
  if (code) {
    switch (auth) {
      case "stripe":
        await createStripeSession(code, request); // @todo return session (like google)
        break;
      case "google":
        session = await createGoogleSession(code, request);
        break;
      default:
        return { error: "Error" };
    }
  }
  if (session) {
    cookie = await getRedirectCookie(request);
    if (cookie["next"]) {
      const next = cookie["next"];
      cookie["next"] = undefined;
      throw redirect(next, {
        headers: {
          "set-cookie": await redirectCookie.serialize(cookie),
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
      // const exists = await db.user.findUnique({ where: { email } });
      // if (exists && exists.confirmed) { // @todo texperimenting
      const url = new URL(request.url);
      const next = url.searchParams.get("next");
      await sendMagicLink(email, { displayName, next }); // @todo notify that can be avoided to user?
      return { state: "success" };
      // }
      // await sendConfrimation(email, { displayName });
      return { state: "confirmation_success" };
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
