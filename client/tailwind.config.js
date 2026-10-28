/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/MboppiBoost.jsx",
    "./src/pages/MboppiBoostOrder.jsx",
    "./src/pages/MboppiBoostOrders.jsx",
    "./src/pages/MboppiBoostTrack.jsx",
    "./src/pages/MboppiBoostWallet.jsx",
    "./src/pages/BoostAdmin.jsx",
    "./src/components/IkeepayCheckout.jsx",
  ],
  prefix: "tw-",
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
