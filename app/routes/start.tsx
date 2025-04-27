import { getUserOrRedirect } from "~/.server/getters";
import StartComponent from "~/components/start/StartComponent";
import type { Route } from "./+types/start";
import { redirect } from "react-router";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // @todo move to a function?
  if (
    (user.metadata?.asset_types.length || 0) < 1 ||
    !user.metadata?.customer_type
  ) {
    return redirect("/onboarding");
  }
  return null;
};

export default function Start() {
  return (
    <div className="flex justify-center items-center relative  w-full ">
      <StartComponent />
    </div>
  );
}
