import { useReducedMotion } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

// El panel viaja aparte: su JS se baja junto con el JSON, cuando la sección está por verse.
const AgentComputer = lazy(() => import("~/components/sitios/AgentComputer").then((m) => ({ default: m.AgentComputer })));
import type { AgentStep } from "~/lib/agentSteps";

type Demo = { userText: string; reply: string; steps: AgentStep[] };

/**
 * Un turno real del agente, reproducido solo. No pesa en la carga: el marco reserva su alto y
 * el JSON congelado (scripts/export-replay-demo.mts) se pide sólo cuando la sección está a 200 px
 * de verse. Sin servidor, sin base, sin SSE.
 */
export function ReplayDemo() {
  const ref = useRef<HTMLElement>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        fetch("/home/replay-demo.json")
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setDemo(d))
          .catch(() => {});
      },
      { rootMargin: "0px 0px 200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const goToPrompt = () => {
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("hero-prompt")?.focus({ preventScroll: true });
  };

  return (
    <section ref={ref} className="mx-auto w-full max-w-7xl px-4 py-16 md:px-[5%] xl:px-0">
      <p className="font-mono text-xs font-bold uppercase tracking-widest text-gray-500">Así trabaja, sin trucos</p>
      <h2 className="mt-2 text-3xl font-bold md:text-4xl">Mira al agente construir una app real, paso a paso</h2>
      {demo && (
        <p className="mt-3 max-w-3xl text-iron">
          Le pidieron: <span className="font-bold text-black">«{demo.userText}»</span>
        </p>
      )}
      <div className="mt-6 h-[560px] overflow-hidden rounded-2xl border-2 border-black bg-white shadow-[8px_8px_0_0_#000]">
        <Suspense fallback={<Loading />}>
          {demo ? <AgentComputer steps={demo.steps} live={false} autoplay={!reduce} /> : <Loading />}
        </Suspense>
      </div>
      <button
        type="button"
        onClick={goToPrompt}
        className="mt-6 rounded-xl border-2 border-black bg-brand-500 px-5 py-2.5 font-bold shadow-[4px_4px_0_0_#000] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
      >
        Construye la tuya →
      </button>
    </section>
  );
}

const Loading = () => <div className="grid h-full place-items-center font-mono text-sm text-gray-400">cargando la computadora del agente…</div>;
