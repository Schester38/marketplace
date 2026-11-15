export const SALES_FUNNEL_THEMES = [
  { id: "ocean", label: "Océan" },
  { id: "sunset", label: "Coucher de soleil" },
  { id: "forest", label: "Forêt" },
  { id: "night", label: "Nuit" },
];

const PALETTES = {
  ocean: {
    background: "#071923",
    surface: "#0d2937",
    surfaceAlt: "#123646",
    accent: "#48d6c1",
    button: "#0f8b7b",
    text: "#f1fbff",
    muted: "#a9c5ce",
  },
  sunset: {
    background: "#24141d",
    surface: "#3a2029",
    surfaceAlt: "#4b2930",
    accent: "#ffb36b",
    button: "#e76f51",
    text: "#fff7f0",
    muted: "#dfbeb2",
  },
  forest: {
    background: "#101e19",
    surface: "#1d3328",
    surfaceAlt: "#294637",
    accent: "#a3d977",
    button: "#478b52",
    text: "#f3fff2",
    muted: "#b4cbb7",
  },
  night: {
    background: "#111426",
    surface: "#1b2038",
    surfaceAlt: "#272e4d",
    accent: "#a8a6ff",
    button: "#625ce7",
    text: "#f5f4ff",
    muted: "#b8bad2",
  },
};

export function getSalesFunnelPalette(theme) {
  return PALETTES[theme] || PALETTES.ocean;
}
