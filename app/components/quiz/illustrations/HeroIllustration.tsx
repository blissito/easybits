import { motion, useReducedMotion } from "motion/react";
import { cn } from "~/utils/cn";

type HeroIllustrationProps = {
  className?: string;
};

export const HeroIllustration = ({ className }: HeroIllustrationProps) => {
  const reduced = useReducedMotion();
  return (
    <motion.svg
      initial={reduced ? false : { opacity: 0, scale: 0.92, rotate: -2 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
      }
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-auto select-none", className)}
      aria-hidden
    >
      {/* White organic blob background */}
      <path
        d="M70,250 Q30,190 80,130 Q130,70 210,80 Q290,90 330,150 Q370,210 340,280 Q310,340 230,340 Q150,340 100,320 Q60,300 70,250 Z"
        fill="#FFFFFF"
        stroke="#000"
        strokeWidth="3"
      />

      {/* Antenna */}
      <line x1="200" y1="120" x2="200" y2="92" stroke="#000" strokeWidth="3" strokeLinecap="round" />
      <circle cx="200" cy="86" r="9" fill="#FFAFA3" stroke="#000" strokeWidth="3" />
      {/* Sparks from antenna */}
      <line x1="178" y1="74" x2="170" y2="66" stroke="#9870ED" strokeWidth="3" strokeLinecap="round" />
      <line x1="222" y1="74" x2="230" y2="66" stroke="#9870ED" strokeWidth="3" strokeLinecap="round" />
      <line x1="200" y1="64" x2="200" y2="54" stroke="#9870ED" strokeWidth="3" strokeLinecap="round" />

      {/* Head */}
      <rect
        x="138"
        y="120"
        width="124"
        height="92"
        rx="16"
        fill="#96B894"
        stroke="#000"
        strokeWidth="3"
      />
      {/* Eyes — big round, brutalist friendly */}
      <circle cx="170" cy="160" r="18" fill="#FFFFFF" stroke="#000" strokeWidth="3" />
      <circle cx="230" cy="160" r="18" fill="#FFFFFF" stroke="#000" strokeWidth="3" />
      <circle cx="174" cy="162" r="8" fill="#000" />
      <circle cx="234" cy="162" r="8" fill="#000" />
      {/* Eye glints */}
      <circle cx="172" cy="158" r="2.5" fill="#FFFFFF" />
      <circle cx="232" cy="158" r="2.5" fill="#FFFFFF" />
      {/* Mouth — speaker grille */}
      <rect x="180" y="188" width="40" height="8" rx="3" fill="#1A1A1A" stroke="#000" strokeWidth="2" />
      <line x1="190" y1="190" x2="190" y2="194" stroke="#FFFFFF" strokeWidth="1.2" />
      <line x1="200" y1="190" x2="200" y2="194" stroke="#FFFFFF" strokeWidth="1.2" />
      <line x1="210" y1="190" x2="210" y2="194" stroke="#FFFFFF" strokeWidth="1.2" />

      {/* Body */}
      <rect
        x="120"
        y="218"
        width="160"
        height="100"
        rx="14"
        fill="#BAD9D8"
        stroke="#000"
        strokeWidth="3"
      />
      {/* Chest screen — happy face inside */}
      <rect x="160" y="234" width="80" height="44" rx="6" fill="#FFFFFF" stroke="#000" strokeWidth="2.5" />
      <circle cx="180" cy="252" r="3" fill="#000" />
      <circle cx="220" cy="252" r="3" fill="#000" />
      <path d="M178,262 Q200,272 222,262" stroke="#000" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Status buttons */}
      <circle cx="138" cy="298" r="5" fill="#FFAFA3" stroke="#000" strokeWidth="2" />
      <circle cx="156" cy="298" r="5" fill="#ECD66E" stroke="#000" strokeWidth="2" />
      <circle cx="174" cy="298" r="5" fill="#96B894" stroke="#000" strokeWidth="2" />

      {/* Left arm */}
      <rect x="86" y="240" width="42" height="16" rx="8" fill="#96B894" stroke="#000" strokeWidth="3" />
      <circle cx="80" cy="248" r="12" fill="#ECD66E" stroke="#000" strokeWidth="3" />
      {/* Right arm holding chat bubble */}
      <rect x="270" y="240" width="42" height="16" rx="8" fill="#96B894" stroke="#000" strokeWidth="3" />
      <circle cx="318" cy="248" r="12" fill="#ECD66E" stroke="#000" strokeWidth="3" />

      {/* Feet */}
      <rect x="148" y="318" width="32" height="22" rx="6" fill="#1A1A1A" stroke="#000" strokeWidth="3" />
      <rect x="220" y="318" width="32" height="22" rx="6" fill="#1A1A1A" stroke="#000" strokeWidth="3" />

      {/* WhatsApp logo (top right, recognizable green bubble with handset) */}
      <g transform="translate(284, 78)">
        {/* WhatsApp green bubble with iconic drop tail at bottom-left */}
        <path
          d="M44,4
             Q82,4 82,42
             Q82,76 50,80
             L18,90
             L26,68
             Q6,60 6,42
             Q6,4 44,4 Z"
          fill="#25D366"
          stroke="#000"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* WhatsApp phone handset — white, brutalist outlined */}
        <path
          d="M32,30
             Q28,30 28,34
             L28,38
             Q28,58 48,66
             L52,68
             Q58,70 60,66
             L62,62
             Q64,58 60,56
             L54,54
             Q50,54 48,58
             Q42,54 38,48
             Q42,46 42,42
             L42,36
             Q42,30 38,30
             L34,30
             Q32,30 32,30 Z"
          fill="#FFFFFF"
          stroke="#000"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>

      {/* Floating sparkle (left) */}
      <path
        d="M58,154 L62,164 L72,168 L62,172 L58,182 L54,172 L44,168 L54,164 Z"
        fill="#FFAFA3"
        stroke="#000"
        strokeWidth="2.5"
      />

      {/* Floating accent dots */}
      <circle cx="68" cy="316" r="5" fill="#9870ED" stroke="#000" strokeWidth="2" />
      <circle cx="350" cy="200" r="4" fill="#000" />
      <circle cx="44" cy="92" r="4" fill="#9870ED" stroke="#000" strokeWidth="2" />
    </motion.svg>
  );
};
