import { getUserOrNull } from "~/.server/getters";
import type { Route } from "./+types/user";

export const action = () => null;
export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  if (intent === "self") {
    return await getUserOrNull(request);
  }
  return null;
};
