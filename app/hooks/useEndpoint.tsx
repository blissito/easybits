import { useFetcher } from "react-router";

export const useEndpoint = (action: string) => {
  const fetcher = useFetcher();
  const remove = async (data: any) => {
    fetcher.submit(
      { ...data }, // id & intent should be present
      {
        method: "delete",
        action,
      }
    );
    // await fetch(endPoint, {
    //   method: "delete",
    //   body: new URLSearchParams(data),
    // });
  };
  const post = async ({ intent, data }: { intent?: string; data: any }) => {
    const response = await fetch(action, {
      method: "post",
      body: new URLSearchParams({
        ...data,
        intent,
      }),
    });
    return await response.json();
  };
  return {
    post,
    remove,
  };
};
