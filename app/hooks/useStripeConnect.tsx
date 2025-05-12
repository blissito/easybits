import { useState, useEffect } from "react";
import {
  loadConnectAndInitialize,
  type StripeConnectInstance,
} from "@stripe/connect-js";

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

  //look for more customization and also move to single file so we can reuse in all instances
  const STRIPE_UI_VARIABLES = {
    colorPrimary: "#9870ED", //brand
    fontFamily: "Avenir",
  };

  useEffect(() => {
    if (connectedAccountId && publishableKey) {
      const fetchClientSecret = async () => {
        const response = await fetch("/api/v1/stripe/account_session", {
          method: "POST",
          body: new URLSearchParams({ connectedAccountId }),
        });

        if (!response.ok) {
          // Handle errors on the client side here
          const { error } = await response.json();
          throw ("An error occurred: ", error);
        } else {
          const data = await response.text();
          return data;
        }
      };

      setStripeConnectInstance(
        loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret,
          appearance: {
            overlays: "dialog",
            variables: STRIPE_UI_VARIABLES,
          },
        })
      );
    }
  }, [connectedAccountId]);

  return stripeConnectInstance;
};

export default useStripeConnect;
