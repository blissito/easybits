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
        d="M80,260 Q40,200 80,140 Q120,80 200,80 Q280,80 320,130 Q360,180 340,250 Q320,320 240,340 Q160,360 110,330 Q70,310 80,260 Z"
        fill="#FFFFFF"
        stroke="#000"
        strokeWidth="3"
      />

      {/* Connecting line bottom-right (decorative pill loop) */}
      <path
        d="M170,330 Q190,360 230,355 Q270,350 270,320 Q270,300 250,300 Q230,300 230,320"
        fill="none"
        stroke="#000"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="170" cy="330" r="4" fill="#000" />
      <circle cx="230" cy="320" r="4" fill="#000" />

      {/* Smartphone (right side, isometric tilt) */}
      <g transform="translate(240,90) rotate(8)">
        <rect
          x="0"
          y="0"
          width="110"
          height="180"
          rx="18"
          fill="#FFFFFF"
          stroke="#000"
          strokeWidth="3"
        />
        {/* Notch */}
        <rect x="42" y="10" width="26" height="6" rx="3" fill="#000" />
        {/* App tiles 2x2 */}
        <rect
          x="14"
          y="34"
          width="36"
          height="36"
          rx="8"
          fill="#96B894"
          stroke="#000"
          strokeWidth="2.5"
        />
        <rect
          x="60"
          y="34"
          width="36"
          height="36"
          rx="8"
          fill="#FFAFA3"
          stroke="#000"
          strokeWidth="2.5"
        />
        <rect
          x="14"
          y="80"
          width="36"
          height="36"
          rx="8"
          fill="#BAD9D8"
          stroke="#000"
          strokeWidth="2.5"
        />
        <rect
          x="60"
          y="80"
          width="36"
          height="36"
          rx="8"
          fill="#ECD66E"
          stroke="#000"
          strokeWidth="2.5"
        />
        {/* Bottom indicator bar */}
        <rect x="40" y="158" width="30" height="4" rx="2" fill="#000" />
      </g>

      {/* Cloud cluster (center) */}
      <g>
        <circle cx="160" cy="170" r="42" fill="#FFFFFF" stroke="#000" strokeWidth="3" />
        <circle cx="200" cy="150" r="32" fill="#FFFFFF" stroke="#000" strokeWidth="3" />
        <circle cx="225" cy="180" r="26" fill="#FFFFFF" stroke="#000" strokeWidth="3" />
        <circle cx="135" cy="195" r="24" fill="#FFFFFF" stroke="#000" strokeWidth="3" />
        {/* Cloud shading hint */}
        <circle cx="160" cy="170" r="42" fill="#BAD9D8" opacity="0.35" />
        <circle cx="200" cy="150" r="32" fill="#BAD9D8" opacity="0.35" />
      </g>

      {/* Connecting line top phone → cloud */}
      <path
        d="M250,150 Q220,160 200,160"
        fill="none"
        stroke="#000"
        strokeWidth="2.5"
        strokeDasharray="4 4"
      />
      <circle cx="250" cy="150" r="3.5" fill="#9870ED" />

      {/* Magnifying glass (bottom-center) */}
      <g transform="translate(150,225)">
        <circle
          cx="0"
          cy="0"
          r="32"
          fill="#FFAFA3"
          fillOpacity="0.55"
          stroke="#000"
          strokeWidth="3"
        />
        {/* inner highlight */}
        <circle cx="-6" cy="-8" r="10" fill="#FFFFFF" opacity="0.8" />
        {/* handle */}
        <rect
          x="22"
          y="22"
          width="38"
          height="12"
          rx="6"
          transform="rotate(35 22 22)"
          fill="#1A1A1A"
          stroke="#000"
          strokeWidth="2.5"
        />
      </g>

      {/* Floating accent dots */}
      <circle cx="100" cy="120" r="4" fill="#9870ED" />
      <circle cx="320" cy="280" r="5" fill="#96B894" stroke="#000" strokeWidth="2" />
      <circle cx="80" cy="220" r="3" fill="#000" />
    </motion.svg>
  );
};
