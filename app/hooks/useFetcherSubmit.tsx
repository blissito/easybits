import type { Asset } from "@prisma/client";
import type { FormEvent } from "react";
import { useFetcher } from "react-router";
import { EmojiConfetti } from "~/components/Confetti";

export const useFetcherSubmit = <T extends Asset>(options: {
  intent: string;
  model?: T;
  modelName?: string;
  action: string;
}) => {
  const { action = "/api/v1/user", intent = "free_subscription" } = options;
  const fetcher = useFetcher();
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("intent", intent);
    fetcher.submit(formData, {
      method: "post",
      action,
    });
  };

  const message = (
    <section className="flex flex-col justify-center items-center text-xl h-[100px] py-12">
      <h2>¡Gracias por suscribirte!</h2>
      <br />
      <p>Ahora revisa tu correo. 📬</p>
      <EmojiConfetti />
    </section>
  );

  const success = fetcher.data?.success;

  const isLoading = fetcher.state !== "idle";
  return { isLoading, handleSubmit, success, message };
};
