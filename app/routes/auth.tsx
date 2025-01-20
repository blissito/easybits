import type { Route } from "./+types/login";
import LoginComponent from "~/components/login/login-component";

export default function Auth({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <LoginComponent />
    </>
  );
}
