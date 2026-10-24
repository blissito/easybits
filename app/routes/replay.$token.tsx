import type { Route } from "./+types/replay.$token";
import { data } from "react-router";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { getSharedReplay } from "~/.server/core/siteTurns.server";
import { AgentComputer } from "~/components/sitios/AgentComputer";
import { TurnSummary } from "~/components/sitios/ChatMessages";
import { partirNarracion } from "~/lib/narracion";

// Replay compartido de un turno: la petición, la respuesta del agente y su computadora paso a
// paso. Sólo existe si el dueño generó la liga (privado por default).
export const meta = () => [{ title: "Replay del agente — EasyBits" }, { name: "robots", content: "noindex" }];

export async function loader({ params }: Route.LoaderArgs) {
  const replay = await getSharedReplay(params.token!);
  if (!replay) throw data("Este replay no existe o ya no es público", { status: 404 });
  return { ...replay, startedAt: replay.startedAt.toISOString() };
}

export default function Replay({ loaderData }: Route.ComponentProps) {
  const { userText, text, steps, startedAt } = loaderData;
  const { resto } = partirNarracion(text, []);
  const [jump, setJump] = useState<{ id: string; at: number } | null>(null);
  return (
    <div className="flex h-dvh flex-col bg-gray-50 md:flex-row">
      <aside className="flex max-h-[45dvh] flex-col gap-4 overflow-y-auto border-b-2 border-black bg-white p-5 md:max-h-none md:w-[38%] md:max-w-md md:border-b-0 md:border-r-2">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo-purple.svg" alt="EasyBits" className="h-6" />
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Replay</span>
        </a>
        <p className="text-xs text-gray-400">{new Date(startedAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}</p>
        <div className="self-end max-w-[90%] rounded-2xl bg-brand-500 px-4 py-3 text-[15px] leading-[22px] text-white whitespace-pre-wrap">{userText}</div>
        <div className="eb-md text-[15px] leading-6">
          <Streamdown linkSafety={{ enabled: false }}>{resto || text}</Streamdown>
        </div>
        <TurnSummary steps={steps} onSelect={(id) => setJump({ id, at: Date.now() })} />
        <a href="/" className="mt-auto rounded-xl border-2 border-black bg-brand-500 px-4 py-2 text-center font-bold shadow-[3px_3px_0_0_#000]">
          Construye la tuya en EasyBits →
        </a>
      </aside>
      <main className="min-h-0 flex-1 p-3 md:p-5">
        <div className="h-full overflow-hidden rounded-xl border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
          <AgentComputer steps={steps} live={false} autoplay jumpTo={jump} />
        </div>
      </main>
    </div>
  );
}
