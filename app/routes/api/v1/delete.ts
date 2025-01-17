import { deleteObject } from "react-hook-multipart";
import type { Route } from "./+types/delete";
import { db } from "~/.server/db";
import { data } from "react-router";

export const action = async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") throw data({ status: 403 });
  /**
   * 1. delete file
   * 2. then delete record
   */
  const r = await deleteObject(params.storageKey);
  await db.asset.delete({ where: { storageKey: params.storageKey } });
  console.info("::FILE_DELETED:: ", params.storageKey);
  return null;
};
