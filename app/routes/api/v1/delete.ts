import { deleteObject } from "~/.server/tigris";
import type { Route } from "./+types/delete";
import { throwStatus } from "./direct-uploads";
import { db } from "~/.server/db";

export const action = async ({ request, params }: Route.ActionArgs) => {
  if (request.method !== "DELETE") throwStatus({ status: 403 });
  /**
   * 1. delete file
   * 2. then delete record
   */
  const r = await deleteObject(params.storageKey);
  await db.asset.delete({ where: { storageKey: params.storageKey } });
  console.info("::FILE_DELETED:: ", params.storageKey);
  return null;
};
