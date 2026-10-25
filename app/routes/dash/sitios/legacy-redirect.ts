import { redirect } from "react-router";
import type { Route } from "./+types/legacy-redirect";

// /dash/sitios/:id → /c/:id, conservando el query (?prompt=, ?publicar=1, ?github=…).
export const loader = ({ request, params }: Route.LoaderArgs) => {
  const { search } = new URL(request.url);
  return redirect(`/c/${params.id}${search}`);
};
