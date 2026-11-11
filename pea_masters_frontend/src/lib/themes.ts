/**
 * Colour themes for Settings > Customization.
 *
 * A theme gives seven base colours; index.css derives the app's whole neutral and brand colour scales from them
 * (:root[data-theme]), so every page, card, border and button follows. "light" is the original PEA palette and
 * sets nothing. Base colours were checked against WCAG AA (4.5:1) for body text, accent text, text on accent
 * buttons and muted text, on both cards and the page background.
 */
export type ThemeId = "light" | "dark" | "black-gold" | "autumn" | "twilight" | "monochrome-beach" | "earth" | "ocean" | "berry"

type ThemeTokens = {
  /** Page background behind the cards */
  canvas: string
  /** Cards, sidebar, top bar, dialogs */
  surface: string
  /** Body text */
  text: string
  /** Buttons, selected states */
  accent: string
  /** Accent coloured text: links, active menu items */
  accentText: string
  /** Text on accent buttons */
  onAccent: string
  /** Focus rings and secondary highlights */
  ring: string
}

export type Theme = {
  id: ThemeId
  name: string
  description: string
  mode: "light" | "dark"
  swatches: { name: string; hex: string }[]
  tokens?: ThemeTokens
}

export const themes: Theme[] = [
  {
    id: "light",
    name: "PEA Light",
    description: "The original look: university burgundy on soft white.",
    mode: "light",
    swatches: [
      { name: "Burgundy", hex: "#8C2433" }, { name: "Rose", hex: "#A63446" }, { name: "Blush", hex: "#F5E1E4" },
      { name: "Soft white", hex: "#F7F5F5" }, { name: "Ink", hex: "#1E1A1B" },
    ],
  },
  {
    id: "dark",
    name: "PEA Dark",
    description: "The same burgundy, easy on the eyes in low light.",
    mode: "dark",
    swatches: [
      { name: "Night", hex: "#161314" }, { name: "Charcoal", hex: "#211C1D" }, { name: "Rose", hex: "#C4475B" },
      { name: "Pink", hex: "#F08A9B" }, { name: "Pale grey", hex: "#F2EEEE" },
    ],
    tokens: { canvas: "#161314", surface: "#211c1d", text: "#f2eeee", accent: "#c4475b", accentText: "#f08a9b", onAccent: "#ffffff", ring: "#e06a7d" },
  },
  {
    id: "black-gold",
    name: "Black & Gold Elegance",
    description: "Black and Prussian blue lit by vivid orange: sophisticated, bold and formal.",
    mode: "dark",
    swatches: [
      { name: "Black", hex: "#000000" }, { name: "Prussian Blue", hex: "#14213D" }, { name: "Orange", hex: "#FCA311" },
      { name: "Alabaster Grey", hex: "#E5E5E5" }, { name: "White", hex: "#FFFFFF" },
    ],
    tokens: { canvas: "#000000", surface: "#14213d", text: "#e5e5e5", accent: "#fca311", accentText: "#fca311", onAccent: "#000000", ring: "#fca311" },
  },
  {
    id: "autumn",
    name: "Warm Autumn Glow",
    description: "Deep crimson, molten amber, blazing orange, honey gold and soft ivory blend for fiery autumn warmth.",
    mode: "light",
    swatches: [
      { name: "Deep Space Blue", hex: "#003049" }, { name: "Flag Red", hex: "#D62828" }, { name: "Princeton Orange", hex: "#F77F00" },
      { name: "Sunflower Gold", hex: "#FCBF49" }, { name: "Vanilla Custard", hex: "#EAE2B7" },
    ],
    tokens: { canvas: "#f5f1dc", surface: "#fffdf6", text: "#003049", accent: "#d62828", accentText: "#b3201f", onAccent: "#ffffff", ring: "#f77f00" },
  },
  {
    id: "twilight",
    name: "Golden Twilight",
    description: "Midnight navy and sapphire set off sparkling yellows, capturing the intrigue of nightfall’s gold.",
    mode: "dark",
    swatches: [
      { name: "Ink Black", hex: "#000814" }, { name: "Prussian Blue", hex: "#001D3D" }, { name: "Oxford Navy", hex: "#003566" },
      { name: "School Bus Yellow", hex: "#FFC300" }, { name: "Gold", hex: "#FFD60A" },
    ],
    tokens: { canvas: "#000814", surface: "#001d3d", text: "#eef2f8", accent: "#ffc300", accentText: "#ffd60a", onAccent: "#000814", ring: "#ffc300" },
  },
  {
    id: "monochrome-beach",
    name: "Monochrome Beach",
    description: "Slate grey, teal and ivory blend seamlessly for a crisp, understated and sophisticated look.",
    mode: "light",
    swatches: [
      { name: "Graphite", hex: "#353535" }, { name: "Stormy Teal", hex: "#3C6E71" }, { name: "White", hex: "#FFFFFF" },
      { name: "Dust Grey", hex: "#D9D9D9" }, { name: "Yale Blue", hex: "#284B63" },
    ],
    tokens: { canvas: "#f2f2f2", surface: "#ffffff", text: "#353535", accent: "#3c6e71", accentText: "#284b63", onAccent: "#ffffff", ring: "#3c6e71" },
  },
  {
    id: "earth",
    name: "Neutral Earth Tones",
    description: "Rich charcoals, wheat, soft tan, bone white and muted brown express chic, subtle sophistication.",
    mode: "light",
    swatches: [
      { name: "Black", hex: "#0A0908" }, { name: "Jet Black", hex: "#22333B" }, { name: "Soft Linen", hex: "#EAE0D5" },
      { name: "Tan", hex: "#C6AC8F" }, { name: "Stone Brown", hex: "#5E503F" },
    ],
    tokens: { canvas: "#eee6dc", surface: "#faf6f1", text: "#0a0908", accent: "#5e503f", accentText: "#5e503f", onAccent: "#ffffff", ring: "#22333b" },
  },
  {
    id: "ocean",
    name: "Ocean Breeze",
    description: "Deep teal, sky blue, soft grey, warm sand and bold orange evoke coastal energy.",
    mode: "light",
    swatches: [
      { name: "Stormy Teal", hex: "#16697A" }, { name: "Pacific Blue", hex: "#489FB5" }, { name: "Sky Blue", hex: "#82C0CC" },
      { name: "Alabaster Grey", hex: "#EDE7E3" }, { name: "Amber Glow", hex: "#FFA62B" },
    ],
    tokens: { canvas: "#f4f0ed", surface: "#ffffff", text: "#0e3a44", accent: "#16697a", accentText: "#16697a", onAccent: "#ffffff", ring: "#489fb5" },
  },
  {
    id: "berry",
    name: "Bold Berry",
    description: "Caramel, blush, berry velvet and deepest violet exude playful boldness with a magnetic charm.",
    mode: "light",
    swatches: [
      { name: "Soft Apricot", hex: "#F9DBBD" }, { name: "Cotton Candy", hex: "#FFA5AB" }, { name: "Blush Rose", hex: "#DA627D" },
      { name: "Cherry Rose", hex: "#A53860" }, { name: "Crimson Violet", hex: "#450920" },
    ],
    tokens: { canvas: "#fcefe3", surface: "#fffaf5", text: "#450920", accent: "#a53860", accentText: "#a53860", onAccent: "#ffffff", ring: "#da627d" },
  },
]

export const isThemeId = (value: unknown): value is ThemeId => themes.some(theme => theme.id === value)

const tokenVars: Record<keyof ThemeTokens, string> = {
  canvas: "--t-canvas", surface: "--t-surface", text: "--t-text", accent: "--t-accent",
  accentText: "--t-accent-text", onAccent: "--t-on-accent", ring: "--t-ring",
}

/** Puts a theme's base colours on <html>; index.css builds the colour scales from them */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement
  const theme = themes.find(item => item.id === id) ?? themes[0]
  for (const name of Object.values(tokenVars)) root.style.removeProperty(name)
  if (!theme.tokens) {
    root.removeAttribute("data-theme")
    root.removeAttribute("data-theme-mode")
    return
  }
  for (const [key, name] of Object.entries(tokenVars) as [keyof ThemeTokens, string][]) root.style.setProperty(name, theme.tokens[key])
  root.setAttribute("data-theme", theme.id)
  root.setAttribute("data-theme-mode", theme.mode)
}
