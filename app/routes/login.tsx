import { redirect } from "react-router";
import type { Route } from "./+types/login";
import { getUserOrNull } from "~/.server/getters";
import LoginComponent from "~/components/login/login-component";
import { createStripeSession, getStripeURL } from "~/.server/stripe.getters";
import { createGoogleSession, getGoogleURL } from "~/.server/google.getters";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // check if user
  const user = await getUserOrNull(request);
  // TODO: uncomment so it takes you to / if already logued in. Comment to keep testing
  // if (user) redirect("/");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  //TODO:  we need to check where did login came from
  if (code) {
    // await createGoogleSession(code, request);
    await createStripeSession(code, request);
  }
  return {};
};

export const action = async ({ request }: Route.ClientActionArgs) => {
  const formData = await request.formData();
  const loginType = formData.get("loginType");

  switch (loginType) {
    case "stripe":
      return redirect(getStripeURL());
    case "gmail":
      return redirect(getGoogleURL());
    case "email-pass":
      return { message: "Login with email/pass" };
    default:
      return { error: "Error" };
  }
};

export default function Login({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  console.log({ loaderData, actionData });

  return (
    <>
      <LoginComponent />
    </>
  );
}
