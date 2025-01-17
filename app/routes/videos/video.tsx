import { getReadURL } from "react-hook-multipart";
import type { Route } from "./+types/video";
import { data } from "react-router";

export const loader = async ({ params }: Route.LoaderArgs) =>
  params.storageKey
    ? ((await getReadURL(params.storageKey)) as string)
    : data("", { status: 404 });

export default function Route({ loaderData }: Route.ComponentProps) {
  return <video src={loaderData} className="w-full h-screen" controls />;
}
