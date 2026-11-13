/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/MboppiBoost.jsx",
    "./src/pages/MboppiBoostOrder.jsx",
    "./src/pages/MboppiBoostOrders.jsx",
    "./src/pages/MboppiBoostTrack.jsx",
    "./src/pages/MboppiBoostWallet.jsx",
    "./src/pages/BoostAdmin.jsx",
    "./src/pages/FormationFunnel.jsx",
    "./src/pages/FormationThanks.jsx",
    "./src/components/FormationFunnelForm.jsx",
    "./src/pages/Freelance.jsx",
  ],
  prefix: "tw-",
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        fr: {
          bg: "var(--fr-bg)",
          surface: "var(--fr-surface)",
          primary: "var(--fr-primary)",
          "primary-dark": "var(--fr-primary-dark)",
          "on-primary": "var(--fr-on-primary)",
          accent: "var(--fr-accent)",
          text: "var(--fr-text)",
          muted: "var(--fr-muted)",
          border: "var(--fr-border)",
          soft: "var(--fr-soft)",
          "soft-2": "var(--fr-soft-2)",
        },
      },
    },
  },
  plugins: [],
};
