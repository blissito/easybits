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

/* ---------- 3.5 Web chat (browser + chat widget) ---------- */
export const WebchatIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Browser window (background) */}
    <rect
      x="32"
      y="34"
      width="74"
      height="56"
      rx="6"
      fill="#C8F9AB"
      stroke={STROKE}
      strokeWidth="3"
    />
    <line x1="32" y1="46" x2="106" y2="46" stroke={STROKE} strokeWidth="2.5" />
    <circle cx="40" cy="40" r="2" fill={STROKE} />
    <circle cx="48" cy="40" r="2" fill={STROKE} />
    {/* Page content lines */}
    <line x1="40" y1="56" x2="80" y2="56" stroke={STROKE} strokeWidth="2" />
    <line x1="40" y1="64" x2="92" y2="64" stroke={STROKE} strokeWidth="2" />
    <line x1="40" y1="72" x2="74" y2="72" stroke={STROKE} strokeWidth="2" />
    {/* Chat widget bubble (popup) */}
    <path
      d="M68,82 L114,82 Q120,82 120,88 L120,108 Q120,114 114,114 L88,114 L80,122 L82,114 L68,114 Q62,114 62,108 L62,88 Q62,82 68,82 Z"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Smiley inside widget */}
    <circle cx="78" cy="96" r="2" fill={STROKE} />
    <circle cx="92" cy="96" r="2" fill={STROKE} />
    <path
      d="M76,102 Q85,108 94,102"
      stroke={STROKE}
      strokeWidth="2"
      fill="none"
    />
    {/* Decorative chat dots floating */}
    <circle cx="34" cy="106" r="3" fill="#9870ED" stroke={STROKE} strokeWidth="2" />
    <circle cx="110" cy="34" r="3" fill="#ECD66E" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- 3.6 Slack/Teams (overlapping speech bubbles + hash) ---------- */
export const SlackTeamsIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Back speech bubble */}
    <path
      d="M30,42 L82,42 Q90,42 90,50 L90,72 Q90,80 82,80 L52,80 L42,90 L46,80 L30,80 Q22,80 22,72 L22,50 Q22,42 30,42 Z"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Hash # inside back bubble */}
    <line x1="38" y1="52" x2="38" y2="72" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
    <line x1="48" y1="52" x2="48" y2="72" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
    <line x1="32" y1="58" x2="54" y2="58" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
    <line x1="32" y1="66" x2="54" y2="66" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
    {/* Front speech bubble (overlapping) */}
    <path
      d="M58,68 L114,68 Q122,68 122,76 L122,98 Q122,106 114,106 L84,106 L74,116 L78,106 L58,106 Q50,106 50,98 L50,76 Q50,68 58,68 Z"
      fill="#ECD66E"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Reply lines inside front bubble */}
    <line x1="60" y1="80" x2="110" y2="80" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
    <line x1="60" y1="90" x2="100" y2="90" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
    {/* Avatar dots */}
    <circle cx="106" cy="44" r="6" fill="#9870ED" stroke={STROKE} strokeWidth="2.5" />
    <circle cx="118" cy="50" r="4" fill="#96B894" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- 3.7 Google Workspace (2x2 grid of app tiles) ---------- */
export const GworkspaceIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Workspace card frame */}
    <rect
      x="32"
      y="34"
      width="76"
      height="76"
      rx="6"
      fill="#F3F0F5"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Gmail tile (top-left) — white with red M */}
    <rect
      x="38"
      y="40"
      width="30"
      height="26"
      rx="4"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    <path
      d="M40,46 L40,62 L42,62 L42,50 L52,60 L62,50 L62,62 L64,62 L64,46 L52,58 Z"
      fill="#AA4958"
      stroke={STROKE}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* Calendar tile (top-right) — blue with 31 */}
    <rect
      x="72"
      y="40"
      width="30"
      height="26"
      rx="4"
      fill="#75BAF9"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    <rect
      x="76"
      y="46"
      width="22"
      height="16"
      rx="2"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="1.5"
    />
    <line x1="76" y1="50" x2="98" y2="50" stroke={STROKE} strokeWidth="1.5" />
    <text
      x="87"
      y="60"
      fontSize="8"
      fontWeight="bold"
      textAnchor="middle"
      fill={STROKE}
    >
      31
    </text>
    {/* Drive tile (bottom-left) — yellow triangle */}
    <rect
      x="38"
      y="76"
      width="30"
      height="26"
      rx="4"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    <polygon
      points="53,80 65,98 41,98"
      fill="#ECD66E"
      stroke={STROKE}
      strokeWidth="2"
      strokeLinejoin="round"
    />
    {/* Sheets tile (bottom-right) — green grid */}
    <rect
      x="72"
      y="76"
      width="30"
      height="26"
      rx="4"
      fill="#96B894"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    <line x1="72" y1="84" x2="102" y2="84" stroke={STROKE} strokeWidth="1.5" />
    <line x1="72" y1="92" x2="102" y2="92" stroke={STROKE} strokeWidth="1.5" />
    <line x1="82" y1="76" x2="82" y2="102" stroke={STROKE} strokeWidth="1.5" />
    <line x1="92" y1="76" x2="92" y2="102" stroke={STROKE} strokeWidth="1.5" />
    {/* Floating "G" badge (top-right of card) */}
    <circle
      cx="108"
      cy="36"
      r="9"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    <text
      x="108"
      y="40"
      fontSize="11"
      fontWeight="bold"
      textAnchor="middle"
      fill="#AA4958"
    >
      G
    </text>
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

/* ---------- 5.4 Custom domain (URL bar + globe + SSL lock) ---------- */
export const DomainIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* URL address bar */}
    <rect
      x="32"
      y="36"
      width="76"
      height="20"
      rx="10"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="2.5"
    />
    {/* Lock (SSL) icon */}
    <rect
      x="38"
      y="42"
      width="8"
      height="8"
      rx="1.5"
      fill="#96B894"
      stroke={STROKE}
      strokeWidth="1.5"
    />
    <path
      d="M40,42 L40,40 Q40,38 42,38 Q44,38 44,40 L44,42"
      stroke={STROKE}
      strokeWidth="1.5"
      fill="none"
    />
    {/* URL text dots */}
    <line x1="50" y1="46" x2="58" y2="46" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
    <text x="62" y="49" fontSize="7" fontWeight="bold" fill={STROKE}>
      .
    </text>
    <line x1="68" y1="46" x2="84" y2="46" stroke={STROKE} strokeWidth="2" strokeLinecap="round" />
    <text x="88" y="49" fontSize="7" fontWeight="bold" fill="#9870ED">
      .com
    </text>
    {/* Globe */}
    <circle
      cx="70"
      cy="92"
      r="28"
      fill="#75BAF9"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Continents hint */}
    <path
      d="M52,82 Q56,76 64,80 Q70,84 78,80 Q86,76 88,84"
      stroke={STROKE}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
    <path
      d="M48,96 Q56,92 62,96 Q70,100 80,96 Q88,92 92,98"
      stroke={STROKE}
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
    />
    {/* Equator */}
    <ellipse cx="70" cy="92" rx="28" ry="9" fill="none" stroke={STROKE} strokeWidth="2" strokeDasharray="3 3" />
    {/* Meridian */}
    <line x1="70" y1="64" x2="70" y2="120" stroke={STROKE} strokeWidth="2" />
    {/* Connection line URL→globe */}
    <line x1="70" y1="56" x2="70" y2="64" stroke={STROKE} strokeWidth="2" strokeDasharray="2 2" />
    {/* Floating accent dot */}
    <circle cx="106" cy="106" r="4" fill="#FFAFA3" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- 5.5 Documents (stacked PDF pages + seal) ---------- */
export const DocumentsIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Back page (peeking) */}
    <rect
      x="46"
      y="32"
      width="56"
      height="76"
      rx="4"
      fill="#BAD9D8"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Front page */}
    <path
      d="M36,40 L78,40 L92,54 L92,114 Q92,118 88,118 L36,118 Q32,118 32,114 L32,44 Q32,40 36,40 Z"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    <path d="M78,40 L78,54 L92,54" fill="none" stroke={STROKE} strokeWidth="3" />
    {/* Header band (branded) */}
    <rect x="40" y="56" width="36" height="6" rx="2" fill="#ECD66E" stroke={STROKE} strokeWidth="2" />
    {/* Body lines */}
    <line x1="40" y1="72" x2="84" y2="72" stroke={STROKE} strokeWidth="2.5" />
    <line x1="40" y1="80" x2="78" y2="80" stroke={STROKE} strokeWidth="2.5" />
    <line x1="40" y1="88" x2="84" y2="88" stroke={STROKE} strokeWidth="2.5" />
    <line x1="40" y1="96" x2="72" y2="96" stroke={STROKE} strokeWidth="2.5" />
    {/* Branding seal */}
    <circle cx="78" cy="106" r="7" fill="#FFAFA3" stroke={STROKE} strokeWidth="2.5" />
    <path d="M75,106 L77,108 L81,103" stroke={STROKE} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ---------- 5.7 Quotes (invoice with items + total) ---------- */
export const QuotesIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Receipt/invoice page */}
    <path
      d="M38,32 L102,32 Q106,32 106,36 L106,116 L96,110 L86,116 L76,110 L66,116 L56,110 L46,116 L38,110 L34,116 L34,36 Q34,32 38,32 Z"
      fill="#FFFFFF"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* "Cotización" header bar */}
    <rect x="42" y="40" width="56" height="8" rx="2" fill="#ECD66E" stroke={STROKE} strokeWidth="2" />
    {/* Item rows */}
    <line x1="42" y1="58" x2="68" y2="58" stroke={STROKE} strokeWidth="2.5" />
    <text x="92" y="61" fontSize="8" fontWeight="bold" textAnchor="end" fill={STROKE}>$1,200</text>
    <line x1="42" y1="70" x2="62" y2="70" stroke={STROKE} strokeWidth="2.5" />
    <text x="92" y="73" fontSize="8" fontWeight="bold" textAnchor="end" fill={STROKE}>$800</text>
    <line x1="42" y1="82" x2="72" y2="82" stroke={STROKE} strokeWidth="2.5" />
    <text x="92" y="85" fontSize="8" fontWeight="bold" textAnchor="end" fill={STROKE}>$2,500</text>
    {/* Divider */}
    <line x1="42" y1="92" x2="98" y2="92" stroke={STROKE} strokeWidth="2" strokeDasharray="2 2" />
    {/* Total row */}
    <rect x="42" y="96" width="56" height="10" rx="2" fill="#96B894" stroke={STROKE} strokeWidth="2.5" />
    <text x="46" y="103.5" fontSize="7" fontWeight="bold" fill={STROKE}>TOTAL</text>
    <text x="94" y="103.5" fontSize="7" fontWeight="bold" textAnchor="end" fill={STROKE}>$4,500</text>
  </svg>
);

/* ---------- 5.8 Payments (credit card + peso + checkmark) ---------- */
export const PaymentsIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Credit card */}
    <rect
      x="28"
      y="44"
      width="84"
      height="56"
      rx="6"
      fill="#75BAF9"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Magnetic stripe */}
    <rect x="28" y="54" width="84" height="10" fill="#1A1A1A" />
    {/* Chip */}
    <rect
      x="36"
      y="72"
      width="14"
      height="11"
      rx="2"
      fill="#ECD66E"
      stroke={STROKE}
      strokeWidth="2"
    />
    {/* Card number dots */}
    <circle cx="62" cy="84" r="1.6" fill={STROKE} />
    <circle cx="68" cy="84" r="1.6" fill={STROKE} />
    <circle cx="74" cy="84" r="1.6" fill={STROKE} />
    <circle cx="80" cy="84" r="1.6" fill={STROKE} />
    <circle cx="90" cy="84" r="1.6" fill={STROKE} />
    <circle cx="96" cy="84" r="1.6" fill={STROKE} />
    <circle cx="102" cy="84" r="1.6" fill={STROKE} />
    {/* Bottom line */}
    <line x1="36" y1="93" x2="56" y2="93" stroke={STROKE} strokeWidth="2" />
    {/* Floating peso badge with check (top-right) */}
    <circle
      cx="106"
      cy="34"
      r="14"
      fill="#96B894"
      stroke={STROKE}
      strokeWidth="3"
    />
    <text
      x="106"
      y="38"
      fontSize="13"
      fontWeight="bold"
      textAnchor="middle"
      fill={STROKE}
    >
      $
    </text>
    {/* Sparkle accent */}
    <path
      d="M30,110 L33,116 L39,118 L33,120 L30,126 L27,120 L21,118 L27,116 Z"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="2"
    />
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

/* ---------- Canva (canvas + brand kit swatches) ---------- */
export const CanvaIllustration = (props: SVGProps<SVGSVGElement>) => (
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
    {/* Design canvas */}
    <rect
      x="34"
      y="36"
      width="72"
      height="56"
      rx="6"
      fill="#FFAFA3"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Heading band */}
    <rect x="42" y="46" width="32" height="6" rx="2" fill="#FFFFFF" stroke={STROKE} strokeWidth="2" />
    {/* Body lines */}
    <line x1="42" y1="60" x2="98" y2="60" stroke={STROKE} strokeWidth="2.5" />
    <line x1="42" y1="68" x2="86" y2="68" stroke={STROKE} strokeWidth="2.5" />
    {/* Decorative circle */}
    <circle cx="92" cy="80" r="6" fill="#ECD66E" stroke={STROKE} strokeWidth="2.5" />
    {/* Brand kit swatches */}
    <rect x="36" y="100" width="14" height="14" rx="3" fill="#FFAFA3" stroke={STROKE} strokeWidth="2.5" />
    <rect x="54" y="100" width="14" height="14" rx="3" fill="#9870ED" stroke={STROKE} strokeWidth="2.5" />
    <rect x="72" y="100" width="14" height="14" rx="3" fill="#ECD66E" stroke={STROKE} strokeWidth="2.5" />
    <rect x="90" y="100" width="14" height="14" rx="3" fill="#BAD9D8" stroke={STROKE} strokeWidth="2.5" />
    {/* Accent dot */}
    <circle cx="106" cy="34" r="4" fill="#9870ED" stroke={STROKE} strokeWidth="2" />
  </svg>
);

/* ---------- Figma (design frame + geometric components) ---------- */
export const FigmaIllustration = (props: SVGProps<SVGSVGElement>) => (
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
      x="30"
      y="34"
      width="80"
      height="76"
      rx="6"
      fill="#BAD9D8"
      stroke={STROKE}
      strokeWidth="3"
    />
    {/* Frame label tab */}
    <rect x="30" y="34" width="34" height="10" rx="3" fill="#FFFFFF" stroke={STROKE} strokeWidth="2.5" />
    {/* Square component */}
    <rect x="42" y="56" width="20" height="20" rx="3" fill="#FFAFA3" stroke={STROKE} strokeWidth="2.5" />
    {/* Circle component */}
    <circle cx="86" cy="66" r="10" fill="#ECD66E" stroke={STROKE} strokeWidth="2.5" />
    {/* Pill component */}
    <rect x="42" y="84" width="56" height="14" rx="7" fill="#9870ED" stroke={STROKE} strokeWidth="2.5" />
    {/* Accent dot */}
    <circle cx="106" cy="34" r="4" fill="#9870ED" stroke={STROKE} strokeWidth="2" />
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
  webchat: WebchatIllustration,
  slackteams: SlackTeamsIllustration,
  gworkspace: GworkspaceIllustration,
  canva: CanvaIllustration,
  figma: FigmaIllustration,
  memory: MemoryIllustration,
  site: SiteIllustration,
  domain: DomainIllustration,
  documents: DocumentsIllustration,
  quotes: QuotesIllustration,
  payments: PaymentsIllustration,
  video: VideoIllustration,
  research: ResearchIllustration,
};
