import { useEffect, useRef, useState, type FormEvent } from "react";
import { GoPaperAirplane } from "react-icons/go";
import Markdown from "~/components/common/Markdown";
import Spinner from "~/components/common/Spinner";
import { useDevstral } from "~/hooks/useDevstral";

export default function Page() {
  const { getAnswer } = useDevstral<string>();
  const [responses, setResponses] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // scroll
  const responsesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    responsesEndRef.current?.scrollIntoView({ behavior: "smooth" }); // @todo convert in hook
  };
  useEffect(() => {
    scrollToBottom();
    inputRef.current?.value = "";
  }, [responses]);
  //

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setIsLoading(true);
    const formData = new FormData(ev.currentTarget);
    const prompt = formData.get("prompt") as string;
    const answer = await getAnswer(prompt);
    // console.log("RESPUESTA:: ", answer);
    // @todo REVISIT for right key
    if (answer) {
      setResponses((resp) => resp + "\n" + answer); // @todo streams
    }
    setIsLoading(false);
    // @todo loading states and toasts?
  };

  return (
    <article className="px-6 w-full max-w-5xl py-20">
      <h1 className="text-2xl font-bold mb-6">
        Probando a Devstral (CodingLLM)
      </h1>
      <section>
        <h3 className="font-semibold text-lg">Respuesta:</h3>
        <main className="border h-[60vh] border-black grid overflow-y-auto">
          {<Markdown>{responses}</Markdown>}
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
