/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1120",      // page background
        panel: "#111C30",    // card background
        lift: "#16253F",     // raised / hover surface
        line: "rgba(148,163,184,0.14)",
        accent: "#2DD4BF",   // teal
        azure: "#60A5FA",    // secondary blue
        muted: "#94A3B8",
        loss: "#FB7185",     // expense
        warn: "#FBBF24",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        sans: ['"Hanken Grotesk"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 28px -16px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(45,212,191,0.35), 0 0 24px -6px rgba(45,212,191,0.35)",
      },
    },
  },
  plugins: [],
};
