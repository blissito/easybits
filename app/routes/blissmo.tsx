import { useState, type FormEvent } from "react";
import Spinner from "~/components/common/Spinner";
import { useDevstral } from "~/hooks/useDevstral";

export default function Page() {
  const { getAnswer } = useDevstral<{ text: string }>();
  const [responses, setResponses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsLoading(true);
    const formData = new FormData(ev.currentTarget);
    console.log(formData.get("prompt"));
    const answer = await getAnswer("¿Qué es jsx?");
    console.log("RESPUESTA_EXITOSA??:: ", answer);
    // @todo REVISIT for right key
    if (answer) {
      setResponses((resp) => [...resp, answer.text]); // @todo streams
    }
    setIsLoading(false);
    // @todo loading states and toasts?
  };

  return (
    <article className="w-max mx-auto py-20">
      <h1 className="text-2xl font-bold mb-6">
        Probando a Devstral (CodingLLM)
      </h1>
      <section>
        <h3 className="font-semibold text-lg">Respuesta:</h3>
        <main className="border h-96 border-black grid overflow-auto">
          {responses}
        </main>
      </section>
      <form onSubmit={handleSubmit} className="max-w-md flex flex-col">
        <input
          required
          className="md:h-20 border-black border-t-0"
          name="prompt"
          id=""
        />
        <button className="block ml-auto border py-3 px-6 border-black my-6">
          {isLoading ? <Spinner /> : "Enviar"}
        </button>
      </form>
    </article>
  );
}
