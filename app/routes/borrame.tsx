import { getPutUrl } from "~/borrame/utils";

export const action = async ({ request }) => {
  const url = await getPutUrl({ Key: "Perron" });
  return new Response(url);
};
