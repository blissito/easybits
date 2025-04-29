import { redirect } from "react-router";
import { destroySession, getSession } from "~/.server/sessions";
import type { Route } from "./+types/logout";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
};
