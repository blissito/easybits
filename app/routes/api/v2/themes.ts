import { LANDING_THEMES } from "@easybits.cloud/html-tailwind-generator";

export async function loader() {
  return Response.json(LANDING_THEMES);
}
