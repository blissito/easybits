import { redirect } from "react-router";
import type { Route } from "./+types/login";
import { createGoogleSession, getGoogleURL } from "~/.server/getters";
import LoginComponent from "~/components/login/login-component";
import { getSession } from "~/.server/sessions";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    await createGoogleSession(code, request);
  }
  const session = await getSession(request.headers.get("Cookie"));
  if (session.has("email")) throw redirect("/");
};
