import { useFetcher, type FetcherSubmitOptions } from "react-router";

let action: FetcherSubmitOptions;

export const useCrud = (options: { modelName: string }) => {
  const { modelName } = options || {};

  switch (modelName) {
    case "client":
      action = {
        method: "post",
        action: "/api/v1/clients",
      };
      break;
  }

  const fetcher = useFetcher();
  const create = (form: Record<string, string>) => {
    fetcher.submit(
      {
        intent: "create",
        data: JSON.stringify(form),
      },
      action
    );
  };
  const update = () => {};
  const remove = (id: string) => {}; // @todo
  return { create, update, remove };
};
