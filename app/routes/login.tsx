import { redirect as rrRedirect } from "react-router";
import type { Route } from "./+types/login";
import LoginComponent from "~/components/login/login-component";
import { createStripeSession, getStripeURL } from "~/.server/stripe.getters";
import { createGoogleSession, getGoogleURL } from "~/.server/google.getters";
import { destroySession, getSession, redirectCookie } from "~/.server/sessions";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import type { User } from "@prisma/client";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // const user = await getUserOrNull(request);
  // if (user) {
  // throw rrRedirect("/dash"); // @todo revisit
  // }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const auth = url.searchParams.get("auth");
  const signout = url.searchParams.has("signout");
  const redirect = url.searchParams.get("redirect") as string;

  if (signout) {
    const session = await getSession(request.headers.get("Cookie"));
    throw rrRedirect("/", {
      headers: {
        "Set-Cookie": await destroySession(session),
      },
    });
  }
  // util
  const getRedirectCookie = async (request: Request) =>
    (await redirectCookie.parse(request.headers.get("Cookie"))) || {};

  const setRedirectCookie = async (request: Request, redirect: string) => {
    const cookieHeader = request.headers.get("Cookie");
    const cookie = (await redirectCookie.parse(cookieHeader)) || {};
    cookie["redirect"] = redirect;
    return cookie;
  };

  // the pair to handle multiple
  if (code) {
    switch (auth) {
      case "stripe":
        await createStripeSession(code, request);
      case "google":
        const cookie = await getRedirectCookie(request);
        await createGoogleSession(code, request, (user: User) => {
          if (!cookie.redirect) return;

          const url = new URL("https://app.kit.com/oauth/authorize");
          // const url = new URL(cookie.redirect || request.url);
          url.searchParams.set("client_id", "easybits");
          url.searchParams.set("response_type", "code");
          url.searchParams.set(
            "redirect_uri",
            "http://localhost:3000/kit/callback"
            // "https://www.easybits.cloud/kit/callback"
          );
          // url.searchParams.set("state", "blissmo");
          throw rrRedirect(url.toString());
        });
      case "email-pass":
        return { message: "Login with email/pass" };
      default:
        return { error: "Error" };
    }
  }

  // redirect trick 🪄
  if (redirect) {
    // cookie creation
    const cookie = await setRedirectCookie(request, redirect);
    return new Response(null, {
      headers: {
        "Set-Cookie": await redirectCookie.serialize(cookie),
      },
    });
  }

  return new Response(null);
};

export const action = async ({ request }: Route.ClientActionArgs) => {
  const formData = await request.formData();
  const auth = formData.get("auth");
  // save url?
  switch (auth) {
    case "stripe":
      return rrRedirect(getStripeURL());
    case "google":
      return rrRedirect(getGoogleURL());
    case "email-pass":
      // @todo auth handler
      return { message: "Login with email/pass" };
    default:
      return { error: "Error" };
  }
};

export const meta = () =>
  getBasicMetaTags({
    title: "Creación de cuenta | EasyBits",
    description: "Elige tu plan y vende tu primer asset",
  });

export default function Login({ loaderData }: Route.ComponentProps) {
  return <LoginComponent />;
}
