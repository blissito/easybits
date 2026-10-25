import { HeroPrompt } from "~/routes/home/HeroPrompt";
import { getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/inicio";

export const meta = () => [{ title: "Inicio — EasyBits" }, { name: "robots", content: "noindex" }];

// Inicio del dash = el chat general del hero: después del login y desde «Inicio» se llega aquí.
export const loader = async ({ request }: Route.LoaderArgs) => {
  await getUserOrRedirect(request);
  return null;
};

export default function DashInicio() {
  return (
    <article className="pt-20 px-4 sm:px-8 pb-24 md:pl-36 w-full max-w-7xl mx-auto overflow-x-hidden">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center">
        <h1 className="mb-6 text-3xl sm:text-4xl font-black tracking-tight">¿Qué construimos hoy?</h1>
        <HeroPrompt loggedIn />
      </div>
    </article>
  );
}
