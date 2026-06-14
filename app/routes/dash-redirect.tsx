import { redirect } from "react-router";
import type { Route } from "./+types/dash-redirect";

export const loader = async ({}: Route.LoaderArgs) => {
  return redirect("/dash/developer");
};
