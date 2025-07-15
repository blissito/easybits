import React, { useState } from "react";

interface NewsletterSubscribeFormProps {
  newsletter: { id: string; name: string };
}

export const NewsletterSubscribeForm: React.FC<
  NewsletterSubscribeFormProps
> = ({ newsletter }) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setSuccess(false);
    const formData = new FormData();
    formData.set("intent", "subscribe_newsletter");
    formData.set("newsletterId", newsletter.id);
    formData.set("email", email);
    const res = await fetch("/api/v1/newsletters", {
      method: "POST",
      body: formData,
    });
    setIsLoading(false);
    if (res.ok) {
      setSuccess(true);
      setEmail("");
    } else {
      setError("No se pudo suscribir. Intenta de nuevo.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 items-center p-4 border rounded bg-white max-w-xs mx-auto mt-8"
    >
      <h2 className="text-lg font-semibold mb-2">
        Suscríbete a {newsletter.name}
      </h2>
      <input
        name="email"
        type="email"
        required
        placeholder="Tu correo electrónico"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border rounded px-3 py-2 w-full"
      />
      <button
        type="submit"
        disabled={isLoading || !email}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {isLoading ? "Suscribiendo..." : "Suscribirse"}
      </button>
      {success && (
        <span className="text-green-600 text-sm mt-2">
          ¡Suscripción exitosa!
        </span>
      )}
      {error && <span className="text-red-600 text-sm mt-2">{error}</span>}
    </form>
  );
};
