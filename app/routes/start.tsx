import { getUserOrRedirect } from "~/.server/getters";
import StartComponent from "~/components/start/StartComponent";
import type { Route } from "./+types/start";
import { redirect } from "react-router";

export const loader = async ({ request }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // @todo move to a function?
  if (
    !user.metadata?.customer_type ||
    (user.metadata?.asset_types.length || 0) < 1
  ) {
    return redirect("/onboarding");
  }
  const isEnrolled = user.roles.find((r) => r === "Enrolled");
  const isProd = process.env.NODE_ENV !== "development";
  if (isProd && !isEnrolled) {
    return redirect("/waitlist");
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
