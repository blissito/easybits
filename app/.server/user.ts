import { redirect } from "react-router";
import { db } from "./db";

export const updateUser = async ({ userId, data }) => {
  console.log({ userId, data });
  return await db.user.update({
    where: {
      id: userId,
    },
    data,
  });
};
