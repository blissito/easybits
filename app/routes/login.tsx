// import { redirect } from "react-router";
import type { Route } from "./+types/login";
// import { createGoogleSession, getGoogleURL } from "~/.server/getters";
import LoginComponent from "~/components/login/login-component";

export const loader = async ({ request }: Route.LoaderArgs) => {
  // const url = new URL(request.url);
  // const code = url.searchParams.get("code");
  // if (code) {
  //   await createGoogleSession(code, request);
  // }
  // return redirect(getGoogleURL());
};

export default function Auth({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <LoginComponent />
    </>
  );
}
