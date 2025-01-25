import { redirect } from "react-router";
import type { Route } from "./+types/login";
import LoginComponent from "~/components/login/login-component";
import { createStripeSession, getStripeURL } from "~/.server/stripe.getters";
import { createGoogleSession, getGoogleURL } from "~/.server/google.getters";
import {
  createHost,
  getFlyAppData,
  listHosts,
} from "~/lib/fly_certs/certs_getters";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const auth = url.searchParams.get("auth");

  if (code) {
    switch (auth) {
      case "stripe":
        await createStripeSession(code, request);
      case "google":
        await createGoogleSession(code, request);
      case "email-pass":
        return { message: "Login with email/pass" };
      default:
        return { error: "Error" };
    }
  }

  return new Response(null);
};

export const action = async ({ request }: Route.ClientActionArgs) => {
  const formData = await request.formData();
  const auth = formData.get("auth");
  switch (auth) {
    case "stripe":
      return redirect(getStripeURL());
    case "google":
      return redirect(getGoogleURL());
    case "email-pass":
      // @todo auth handler
      return { message: "Login with email/pass" };
    default:
      return { error: "Error" };
  }
};

export default function Login({ loaderData }: Route.ComponentProps) {
  return <LoginComponent />;
}
