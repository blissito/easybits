import { useState, useEffect } from "react";
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/connect-js";
import { useFetcher } from "react-router";

export const useStripeConnect = ({
  connectedAccountId,
  publishableKey,
}: {
  connectedAccountId: string;
  publishableKey: string;
}) => {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<
    StripeConnectInstance | undefined
  >();

  //   const createSession = useFetcher();

  useEffect(() => {
    if (connectedAccountId && publishableKey) {
      const fetchClientSecret = async () => {
        const response = await fetch("/api/v1/stripe/account_session", {
          method: "POST",
          //   headers: {
          //     // "Content-Type": "multipart/form-data",
          //   },
          body: new URLSearchParams({ connectedAccountId }),
        });

        if (!response.ok) {
          // Handle errors on the client side here
          const { error } = await response.json();
          throw ("An error occurred: ", error);
        } else {
          const data = await response.text();
          console.log(data);
          return data;
        }
      };

      //   const fetchClientSecret = async () =>
      //     createSession.submit(
      //       { account: connectedAccountId },
      //       { method: "post", action: "api/v1/stripe/account_session" }
      //     );

      setStripeConnectInstance(
        loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret,
          appearance: {
            overlays: "dialog",
            variables: {
              colorPrimary: "#635BFF",
            },
          },
        })
      );
    }
  }, [connectedAccountId]);

  return stripeConnectInstance;
};

export default useStripeConnect;
