import { motion } from "motion/react";

// Ilustraciones de los diálogos del editor de sitios: caricatura plana (contorno
// grueso, rellenos sólidos, sombra dura), animación en bucle FINITO.
const INK = "#000";
const BRAND = "#9870ED";
const AMBER = "#fbbf24";
// Transformar respecto a la caja del propio elemento SVG, no del lienzo.
const box = { transformBox: "fill-box" } as const;

/** El sitio (ventanita de navegador) cae al bote de basura: la tapa abre y cierra. */
export function DeleteSiteArt() {
  const t = { duration: 2.4, repeat: 2, repeatDelay: 0.8, ease: "easeInOut" } as const;
  return (
    <svg viewBox="0 0 200 150" className="mx-auto h-36 w-auto" aria-hidden="true">
      {/* sombra dura del bote */}
      <rect x="78" y="72" width="60" height="66" rx="6" fill={INK} />
      {/* ventanita del sitio */}
      <motion.g
        style={{ ...box, transformOrigin: "center" }}
        initial={{ y: 0, scale: 1, opacity: 1 }}
        animate={{ y: [0, 0, 74, 74, 0], scale: [1, 1, 0.55, 0.55, 1], opacity: [1, 1, 0, 0, 1] }}
        transition={{ ...t, times: [0, 0.2, 0.5, 0.92, 1] }}
      >
        <rect x="76" y="6" width="56" height="40" rx="5" fill="#fff" stroke={INK} strokeWidth="4" />
        <path d="M76 17h56" stroke={INK} strokeWidth="4" />
        <rect x="78" y="8" width="52" height="7" rx="2" fill={AMBER} />
        <rect x="84" y="24" width="28" height="5" rx="2" fill={BRAND} />
        <rect x="84" y="33" width="40" height="4" rx="2" fill={INK} opacity=".25" />
      </motion.g>
      {/* cuerpo del bote */}
      <rect x="72" y="66" width="60" height="66" rx="6" fill="#fff" stroke={INK} strokeWidth="4" />
      <path d="M90 80v38M102 80v38M114 80v38" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      {/* tapa: gira sobre su esquina izquierda */}
      <motion.g
        style={{ ...box, transformOrigin: "0% 100%" }}
        animate={{ rotate: [0, -32, -32, 0, 0] }}
        transition={{ ...t, times: [0, 0.18, 0.55, 0.7, 1] }}
      >
        <rect x="64" y="54" width="76" height="12" rx="4" fill={BRAND} stroke={INK} strokeWidth="4" />
        <rect x="92" y="45" width="20" height="9" rx="3" fill={BRAND} stroke={INK} strokeWidth="4" />
      </motion.g>
    </svg>
  );
}

/** El código sale de la ventanita y entra a la carpeta del repo, que salta al recibirlo. */
export function GithubRepoArt() {
  const t = { duration: 1.6, repeat: 3, repeatDelay: 0.3, ease: "easeInOut" } as const;
  return (
    <svg viewBox="0 0 220 130" className="mx-auto h-32 w-auto" aria-hidden="true">
      {/* ventanita con el código */}
      <rect x="18" y="34" width="70" height="56" rx="6" fill={INK} />
      <rect x="12" y="28" width="70" height="56" rx="6" fill="#fff" stroke={INK} strokeWidth="4" />
      <path d="M12 40h70" stroke={INK} strokeWidth="4" />
      <rect x="14" y="30" width="66" height="8" rx="2" fill={AMBER} />
      <rect x="22" y="50" width="34" height="5" rx="2" fill={BRAND} />
      <rect x="22" y="60" width="48" height="5" rx="2" fill={INK} opacity=".25" />
      <rect x="22" y="70" width="26" height="5" rx="2" fill={INK} opacity=".25" />
      {/* ficha de código en vuelo */}
      <motion.g
        animate={{ x: [0, 0, 104, 104], y: [0, -22, 0, 0], opacity: [0, 1, 1, 0], scale: [0.8, 1, 0.7, 0.7] }}
        transition={{ ...t, times: [0, 0.2, 0.75, 1] }}
        style={{ ...box, transformOrigin: "center" }}
      >
        <rect x="48" y="36" width="34" height="22" rx="5" fill={BRAND} stroke={INK} strokeWidth="4" />
        <path d="M60 42l-5 5 5 5M70 42l5 5-5 5" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      {/* carpeta del repo */}
      <motion.g
        animate={{ y: [0, 0, -6, 0] }}
        transition={{ ...t, times: [0, 0.72, 0.84, 1] }}
      >
        <rect x="134" y="50" width="76" height="58" rx="6" fill={INK} />
        <path d="M128 52a6 6 0 0 1 6-6h20l8 8h36a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6h-64a6 6 0 0 1-6-6z" fill={AMBER} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
        {/* rama de git */}
        <circle cx="152" cy="68" r="5" fill="#fff" stroke={INK} strokeWidth="3.5" />
        <circle cx="152" cy="90" r="5" fill="#fff" stroke={INK} strokeWidth="3.5" />
        <circle cx="176" cy="74" r="5" fill="#fff" stroke={INK} strokeWidth="3.5" />
        <path d="M152 73v12M176 79c0 8-10 8-20 9" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}
