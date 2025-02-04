import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/{**,.client,.server}/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          500: "#9870ED",
        },
        greenGrass: "#A6EB9A",
        lavander: "#6772E5",
        grayLight: "#F9F9F9",
        sky: "#B2DAD8",
        linen: "#F3D7B8",
        rose: "#F4B7EC",
        lime: "#C8F9AB",
        berry: "#E299A4",
        munsell: "#DAA23D",
      },
      backgroundImage: {
        patternDark: "url('/pattern-dark.svg')",
      },
      fontFamily: {
        sans: [
          '"Inter"',
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
