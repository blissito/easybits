import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { useState } from "react";
import { Modal } from "~/components/common/Modal";
import { useSubmit } from "react-router";
import Spinner from "~/components/common/Spinner";
import { cn } from "~/utils/cn";

export default function PaymentModal({
  stripePromise,
  asset,
  checkoutSession,
  text,
}) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const submit = useSubmit();
  const assetUserStripeId = asset?.user?.stripe?.id; //can youse your own user if already loggued in stripe for testing
  const { hexColor } = asset?.user?.storeConfig || {};

  const handleSubmit = () => {
    setIsOpen(true);

    const formData = new FormData();
    formData.append("stripeAccount", assetUserStripeId);

    submit(formData, {
      method: "post",
    });
  };

  return (
    <div>
      {assetUserStripeId && (
        <button
          className={cn(
            "hidden md:grid h-16 w-full text-2xl font-bold border-b-[2px] bg-[#CE95F9] border-black place-content-center disabled:text-gray-500 disabled:bg-gray-400/40"
          )}
          style={{ background: hexColor }}
          onClick={handleSubmit}
        >
          {text}
        </button>
      )}
      <Modal
        key="asset-payment"
        containerClassName="z-50 text-black text-center "
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      >
        {stripePromise && checkoutSession?.client_secret ? (
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ clientSecret: checkoutSession?.client_secret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : (
          <Spinner />
        )}
      </Modal>
    </div>
  );
}
