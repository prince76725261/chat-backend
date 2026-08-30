/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        wa: {
          green: "#00a884",
          greenDark: "#008069",
          bubble: "#d9fdd3",
          bubbleDark: "#005c4b",
          panel: "#ffffff",
          panelDark: "#111b21",
          sidebar: "#f0f2f5",
          sidebarDark: "#202c33",
          hover: "#f5f6f6",
          hoverDark: "#2a3942",
          border: "#e9edef",
          borderDark: "#2f3b43",
          text: "#111b21",
          textDark: "#e9edef",
          muted: "#667781",
          mutedDark: "#8696a0",
          tick: "#53bdeb",
        },
      },
      keyframes: {
        "fade-up": { "0%": { opacity: 0, transform: "translateY(6px)" }, "100%": { opacity: 1, transform: "none" } },
        blink: { "0%,80%,100%": { opacity: 0.3 }, "40%": { opacity: 1 } },
      },
      animation: {
        "fade-up": "fade-up .18s ease-out",
        blink: "blink 1.4s infinite",
      },
    },
  },
  plugins: [],
};
