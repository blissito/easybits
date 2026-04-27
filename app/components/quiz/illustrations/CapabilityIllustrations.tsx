import type { ComponentType, SVGProps } from "react";

const STROKE = "#000";
const BASE: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 140 140",
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/* ---------- 1. Voice (microphone + waves) ---------- */
export const VoiceIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Mic body */}
    <rect
      x="58"
      y="38"
      width="24"
      height="42"
      rx="12"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Mic stand U */}
    <path
      d="M48,72 Q48,92 70,92 Q92,92 92,72"
      stroke={STROKE}
      strokeWidth="3"
      fill="none"
    />
    <line x1="70" y1="92" x2="70" y2="106" stroke={STROKE} strokeWidth="3" />
    <line x1="58" y1="106" x2="82" y2="106" stroke={STROKE} strokeWidth="3" />
    {/* Sound waves left */}
    <path
      d="M36,52 Q30,60 36,68"
      stroke={STROKE}
      strokeWidth="2.5"
      fill="none"
    />
    <path
      d="M30,46 Q22,60 30,74"
      stroke={STROKE}
      strokeWidth="2.5"
      fill="none"
    />
    {/* Sound waves right */}
    <path
      d="M104,52 Q110,60 104,68"
      stroke={STROKE}
      strokeWidth="2.5"
      fill="none"
    />
    <path
      d="M110,46 Q118,60 110,74"
      stroke={STROKE}
      strokeWidth="2.5"
      fill="none"
    />
    {/* Accent dot */}
    <circle cx="106" cy="34" r="4" fill="#9870ED" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- 2. Images (picture frame with landscape) ---------- */
export const ImagesIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Frame */}
    <rect
      x="36"
      y="38"
      width="68"
      height="64"
      rx="6"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Sun */}
    <circle cx="86" cy="58" r="7" fill="#ECD66E" stroke={STROKE} strokeWidth="2.5" />
    {/* Mountains */}
    <path
      d="M36,90 L54,68 L66,80 L82,60 L104,90 Z"
      fill="#96B894"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    {/* Frame inner border emphasis */}
    <rect
      x="36"
      y="38"
      width="68"
      height="64"
      rx="6"
      stroke={STROKE}
      strokeWidth="3"
      fill="none"
    />
    {/* Decorative pixel cluster */}
    <rect x="106" y="106" width="6" height="6" fill="#9870ED" stroke={STROKE} strokeWidth="2" />
    <rect x="114" y="106" width="6" height="6" fill="#BAD9D8" stroke={STROKE} strokeWidth="2" />
    <rect x="106" y="114" width="6" height="6" fill="#ECD66E" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- 3. WhatsApp (phone + chat bubble) ---------- */
export const WhatsAppIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Phone */}
    <rect
      x="40"
      y="32"
      width="46"
      height="78"
      rx="8"
      fill="#ECD66E"
      stroke={STROKE}
      strokeWidth="3"
    />
    <rect x="56" y="38" width="14" height="3" rx="1.5" fill={STROKE} />
    <circle cx="63" cy="102" r="3" fill={STROKE} />
    {/* Chat bubble */}
    <path
      d="M76,52 L116,52 Q124,52 124,60 L124,76 Q124,84 116,84 L96,84 L88,92 L90,84 L76,84 Q68,84 68,76 L68,60 Q68,52 76,52 Z"
      fill="#96B894"
      stroke={STROKE}
      strokeWidth="3"
    />
    <line x1="78" y1="62" x2="114" y2="62" stroke={STROKE} strokeWidth="2.5" />
    <line x1="78" y1="72" x2="100" y2="72" stroke={STROKE} strokeWidth="2.5" />
  </svg>
);

/* ---------- 4. Memory (stacked DB disks + spark) ---------- */
export const MemoryIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Disk top */}
    <ellipse
      cx="70"
      cy="46"
      rx="32"
      ry="9"
      fill="#BAD9D8"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Disk middle band */}
    <path
      d="M38,46 L38,66 Q38,75 70,75 Q102,75 102,66 L102,46"
      fill="#BAD9D8"
      stroke={STROKE}
      strokeWidth="3"
    />
    <ellipse cx="70" cy="66" rx="32" ry="9" fill="none" stroke={STROKE} strokeWidth="3" />
    {/* Disk bottom band */}
    <path
      d="M38,66 L38,86 Q38,95 70,95 Q102,95 102,86 L102,66"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    <ellipse cx="70" cy="86" rx="32" ry="9" fill="none" stroke={STROKE} strokeWidth="3" />
    {/* Status dots */}
    <circle cx="56" cy="86" r="3" fill="#96B894" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="56" cy="66" r="3" fill="#96B894" stroke={STROKE} strokeWidth="1.5" />
    {/* Spark */}
    <path d="M106,30 L110,38 L118,40 L110,42 L106,50 L102,42 L94,40 L102,38 Z" fill="#ECD66E" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- 5. Site (browser + form) ---------- */
export const SiteIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Browser window */}
    <rect
      x="32"
      y="36"
      width="76"
      height="68"
      rx="6"
      fill="#C8F9AB"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Browser bar */}
    <line x1="32" y1="50" x2="108" y2="50" stroke={STROKE} strokeWidth="3" />
    <circle cx="40" cy="43" r="2.5" fill="#FFAFA3" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="48" cy="43" r="2.5" fill="#ECD66E" stroke={STROKE} strokeWidth="1.5" />
    <circle cx="56" cy="43" r="2.5" fill="#96B894" stroke={STROKE} strokeWidth="1.5" />
    {/* Form input */}
    <rect x="42" y="60" width="56" height="10" rx="3" fill="#FFFFFF" stroke={STROKE} strokeWidth="2.5" />
    <rect x="42" y="74" width="40" height="10" rx="3" fill="#FFFFFF" stroke={STROKE} strokeWidth="2.5" />
    {/* Submit button */}
    <rect x="42" y="88" width="32" height="10" rx="5" fill="#9870ED" stroke={STROKE} strokeWidth="2.5" />
  </svg>
);

/* ---------- 6. Video (clapperboard) ---------- */
export const VideoIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Clapper top stripes */}
    <g transform="translate(28,38) rotate(-6 0 0)">
      <rect
        x="0"
        y="0"
        width="86"
        height="14"
        rx="2"
        fill="#1A1A1A"
        stroke={STROKE}
        strokeWidth="2.5"
      />
      <polygon points="6,2 14,12 22,2" fill="#FFFFFF" />
      <polygon points="26,2 34,12 42,2" fill="#FFFFFF" />
      <polygon points="46,2 54,12 62,2" fill="#FFFFFF" />
      <polygon points="66,2 74,12 82,2" fill="#FFFFFF" />
    </g>
    {/* Clapper body */}
    <rect
      x="28"
      y="56"
      width="84"
      height="50"
      rx="4"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Play triangle */}
    <polygon
      points="60,70 60,94 82,82"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="2.5"
    />
  </svg>
);

/* ---------- 7. Research (magnifier on document, brand pearl) ---------- */
export const ResearchIllustration = (props: SVGProps<SVGSVGElement>) => (
  <svg {...BASE} {...props}>
    <rect
      x="20"
      y="22"
      width="100"
      height="100"
      rx="22"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Document */}
    <path
      d="M44,32 L86,32 L100,46 L100,108 Q100,112 96,112 L44,112 Q40,112 40,108 L40,36 Q40,32 44,32 Z"
      fill="#BAD9D8"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Document fold */}
    <path d="M86,32 L86,46 L100,46" fill="none" stroke={STROKE} strokeWidth="3" />
    {/* Lines on document */}
    <line x1="48" y1="56" x2="80" y2="56" stroke={STROKE} strokeWidth="2.5" />
    <line x1="48" y1="64" x2="92" y2="64" stroke={STROKE} strokeWidth="2.5" />
    <line x1="48" y1="72" x2="76" y2="72" stroke={STROKE} strokeWidth="2.5" />
    {/* Magnifier */}
    <circle
      cx="92"
      cy="92"
      r="20"
      fill="#FFAFA3"
      fillOpacity="0.85"
      stroke={STROKE}
      strokeWidth="3"
    />
    <circle cx="86" cy="86" r="6" fill="#FFFFFF" opacity="0.7" />
    {/* Magnifier handle */}
    <rect
      x="106"
      y="106"
      width="20"
      height="8"
      rx="4"
      transform="rotate(40 106 106)"
      fill="#1A1A1A"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    {/* Pearl indicator (premium accent) */}
    <circle cx="34" cy="34" r="5" fill="#9870ED" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- Map by capability id ---------- */
export const ILLUSTRATION_BY_ID: Record<
  string,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  voice: VoiceIllustration,
  images: ImagesIllustration,
  whatsapp: WhatsAppIllustration,
  memory: MemoryIllustration,
  site: SiteIllustration,
  video: VideoIllustration,
  research: ResearchIllustration,
};
