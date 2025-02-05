import type { Asset } from "@prisma/client";
import { useFetcher } from "react-router";

export const AssetForm = ({
  onClose,
}: {
  onClose?: (values: Asset) => void;
}) => {
  const fetcher = useFetcher();
  const submit = (values: Asset) => {
    fetcher.submit();
    onClose?.(values);
  };
  return (
    <fetcher.Form>
      <h2>Asset form</h2>
    </fetcher.Form>
  );
};
