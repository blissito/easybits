import { useEffect, useRef, useState, type FormEvent } from "react";
import { GoPaperAirplane } from "react-icons/go";
import Markdown from "~/components/common/Markdown";
import Spinner from "~/components/common/Spinner";
import { useDevstral } from "~/hooks/useDevstral";

export default function Page() {
  const { getAnswer, queryLLMStream } = useDevstral<string>();
  const [responses, setResponses] = useState("");
  const [currentResponse, setCurrentResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // scroll
  const responsesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    responsesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // @todo convert in hook
  };
  useEffect(() => {
    scrollToBottom();
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [responses, currentResponse]);
  //

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsLoading(true);
    setCurrentResponse("");
    const formData = new FormData(ev.currentTarget);
    const prompt = formData.get("prompt") as string;

    let finalResponse = "";
    const success = await queryLLMStream(prompt, (chunk) => {
      setCurrentResponse((prev) => {
        const newResponse = prev + chunk;
        finalResponse = newResponse; // Capturar la respuesta final
        return newResponse;
      });
    });

    if (success && finalResponse) {
      setResponses((prev) => prev + "\n" + finalResponse);
      setCurrentResponse("");
    }
    setIsLoading(false);
  };

  return (
    <article className="px-6 w-full max-w-5xl py-20 mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        Probando a Phi4:14b (State-of-the-art Open LLM from Microsoft)
      </h1>
      <p>
        El LLM con el que estás ahora conversando, es sabio en programación. Yo
        lo monté (
        <a target="_blank" rel="noreferrer" href="https://www.hectorbliss.com">
          blissito
        </a>
        ). Gracias a sus synthetic datasets que contienen información filtrada
        de dominios públicos e incluye libros académicos y datasets Q&A.
        <br />
        También estoy probando a Gemma3:4b y otros modelos para ver con cuál no
        me quedo pobre pero me ayuda de verdad. 💸 🤖 ¿Qué esperas? Pregunta
        algo profesional. 🛰️
      </p>
      <section>
        <h3 className="font-semibold text-lg mt-6 mb-2">Respuesta:</h3>
        <p className="text-xs text-gray-500">
          {" "}
          Toma en cuenta que mi servidor a pesar de que me sale caro, es muy
          básico y algunas veces le toma algo de tiempo responder. 🕰️
        </p>
        <main className="border h-[60vh] border-black grid overflow-y-auto px-2">
          {
            <Markdown>
              {responses + (currentResponse ? "\n" + currentResponse : "")}
            </Markdown>
          }
          <div ref={responsesEndRef} />
        </main>
      </section>
      <form
        onSubmit={handleSubmit}
        className="flex justify-center w-full pr-6 gap-2"
      >
        <input
          ref={inputRef}
          required
          className="md:h-20 border-black border-t-0 w-full"
          name="prompt"
          id=""
          defaultValue={"Hola Devstral 👋🏼 ¿Cómo puedes ayudarme?"}
        />
        <button className="ml-auto border py-3 px-6 border-black my-6 flex gap-3 items-center">
          {isLoading ? <Spinner /> : "Enviar"}
          {!isLoading && (
            <span>
              <GoPaperAirplane />
            </span>
          )}
        </button>
      </form>
    </article>
  );
}
