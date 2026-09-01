import { useEffect, useRef } from "react";

// Mide una lectura y la manda en dos envíos: alta al abrir, cierre al salir.
//
// El id lo genera el navegador para que el segundo envío pueda ser un sendBeacon
// puro — sobrevive al cierre de la pestaña, pero no puede leer respuestas, así que
// no serviría para recibir un id del servidor.
//
// TODO el estado vive en refs a propósito. React monta, limpia y vuelve a montar
// en StrictMode; con el estado en variables del efecto, ese remonte reiniciaba el
// contador y mandaba un cierre con ceros — es decir, todos los posts saldrían como
// "nadie los lee". Con refs, el remonte continúa la MISMA medición.

const ENDPOINT = "/api/v1/blog-read";

/** Fin del artículo: el centinela que decide si alguien "llegó al final". */
export const READ_SENTINEL_ID = "post-end";

/**
 * Suma el tiempo transcurrido SOLO si la pestaña estaba al frente. Extraído del
 * efecto para poder probarlo: en un navegador automatizado la pestaña siempre está
 * oculta, así que esta rama nunca se ejercita end-to-end.
 */
export function accumulateSeconds(
  previous: number,
  elapsedMs: number,
  visible: boolean
): number {
  if (!visible || elapsedMs <= 0) return previous;
  return previous + elapsedMs / 1000;
}

/** ¿Vale la pena reportar esta lectura? */
export function worthReporting(seconds: number, depth: number, completed: boolean): boolean {
  // Menos de un segundo y sin scroll no es una lectura: es un remonte de React o un
  // rebote instantáneo. Reportarlo dejaría la fila en ceros y hundiría la mediana;
  // sin cierre, la fila queda como dato AUSENTE, que es la verdad.
  return seconds >= 1 || depth > 0 || completed;
}

const post = (payload: object, beacon = false) => {
  const body = JSON.stringify(payload);
  if (beacon && navigator.sendBeacon) {
    // sendBeacon sobrevive a la descarga de la página; fetch no siempre.
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    return;
  }
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
    // Medir nunca puede tumbar la página que se está leyendo.
  }).catch(() => {});
};

export function useReadTracking(slug: string, lang?: string) {
  const viewId = useRef<string>("");
  const opened = useRef(false);
  const seconds = useRef(0);
  const depth = useRef(0);
  const completed = useRef(false);

  useEffect(() => {
    if (!slug) return;

    if (!viewId.current) {
      // randomUUID exige contexto seguro (https o localhost). Sin él no medimos,
      // pero tampoco rompemos la lectura.
      viewId.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
    }
    const id = viewId.current;
    if (!id) return;

    if (!opened.current) {
      opened.current = true;
      post({
        intent: "open",
        viewId: id,
        slug,
        lang,
        referrer: document.referrer || "",
      });
    }

    // ─── Segundos con la pestaña AL FRENTE ───
    // Sumar tiempo de reloj contaría una pestaña olvidada como tres horas de
    // lectura. Solo avanza mientras el documento está visible.
    let lastTick = Date.now();
    const tick = () => {
      const now = Date.now();
      seconds.current = accumulateSeconds(
        seconds.current,
        now - lastTick,
        document.visibilityState === "visible"
      );
      lastTick = now;
    };
    const timer = window.setInterval(tick, 1000);

    // ─── Profundidad máxima ───
    let queued = false;
    const measureDepth = () => {
      queued = false;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable <= 0 ? 100 : Math.round((window.scrollY / scrollable) * 100);
      depth.current = Math.max(depth.current, Math.min(100, Math.max(0, pct)));
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measureDepth);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    measureDepth();

    // ─── ¿Llegó al final? ───
    // Un centinela al final del artículo, no un "90% de la página": el pie y los
    // relacionados ocupan pantalla, así que el porcentaje puro miente.
    const sentinel = document.getElementById(READ_SENTINEL_ID);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          completed.current = true;
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (sentinel) observer.observe(sentinel);

    // ─── Cierre ───
    const sendClose = (beacon: boolean) => {
      tick();
      if (!worthReporting(seconds.current, depth.current, completed.current)) return;
      post(
        {
          intent: "close",
          viewId: id,
          seconds: Math.round(seconds.current),
          depth: depth.current,
          completed: completed.current,
        },
        beacon
      );
    };

    // `visibilitychange` es el que funciona en móvil, donde `beforeunload` no se
    // dispara si el sistema mata la pestaña. Se puede enviar más de una vez: el
    // servidor sobrescribe, así que gana la última medición, que es la buena.
    const onHide = () => {
      if (document.visibilityState === "hidden") sendClose(true);
    };
    const onPageHide = () => sendClose(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      observer.disconnect();
      // Salir del post por navegación interna también es el fin de la lectura.
      sendClose(false);
    };
  }, [slug, lang]);
}
