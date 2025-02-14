import { db } from "~/.server/db";
import type { Route } from "./+types/mainm3u8";

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { fileId } = params;
  const file = await db.file.findUnique({
    where: {
      id: fileId,
    },
  });
  if (!file || !file.masterPlaylistContent)
    throw new Response("No playlist found", { status: 404 });

  console.log("FILEID!", file.masterPlaylistContent);

  return new Response(file.masterPlaylistContent);
};
