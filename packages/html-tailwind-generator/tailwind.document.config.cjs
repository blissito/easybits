/**
 * Tailwind config used ONLY to precompile the document editor chrome (DocumentCanvas +
 * DocumentActionBar) into `dist/document.css`. Preflight is OFF so importing this CSS in a
 * host app never resets the host's own styles — it adds only the utilities the chrome uses.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/document/**/*.tsx"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F5F1FC",
          100: "#F3F0F5",
          500: "#9870ED",
          600: "#7C5CE0",
        },
      },
    },
  },
  plugins: [],
};
