"use client";
// Client-side appearance state: visual "skin" + display size, persisted in
// localStorage and applied as data-attributes on <html>. The matching CSS lives
// in globals.css. An init script in layout.tsx applies both before first paint
// (no flash). Components listen for the "jotter-appearance" event to stay in sync.

export type Skin =
  | "default" | "neo" | "tech" | "punk"
  | "editorial" | "bubblegum" | "pixel" | "deco" | "cyber" | "win95"
  | "amber" | "lcars" | "teletext" | "terminal" | "mac" | "vector"
  | "fairlight" | "swiss" | "darkside" | "system1" | "system7" | "bitmap"
  | "next" | "beos" | "risc" | "irix" | "win31" | "cde";
export type FontSize = "sm" | "md" | "lg" | "xl";

export const SKIN_KEY = "jotter.skin.v1";
export const FONT_KEY = "jotter.fontsize.v1";
export const SKIN_ORDER_KEY = "jotter.skinorder.v1";
export const APPEARANCE_EVENT = "jotter-appearance";

// Every skin ships a light palette + an accompanying night mode (toggled by the
// theme switch). Ordered for a 3×3 grid in the settings page.
export const SKINS: { id: Skin; name: string; desc: string; swatch: string[]; dark?: boolean }[] = [
  { id: "default", name: "Jotter", desc: "Soft cream, muted gold, rounded panels. The original.", swatch: ["#fcfdf2", "#e3bb4e", "#8acbb0", "#1b1d16"] },
  { id: "neo", name: "Modern Neobrutalism", desc: "Bold geometric type, thick borders, hard offset shadows, high-contrast teal.", swatch: ["#fcfdf2", "#14b8a6", "#000000", "#000000"] },
  { id: "tech", name: "Tech-Minimal", desc: "Monospace throughout, stark thin grid, no shadows, terminal green.", swatch: ["#fcfdf2", "#15803d", "#000000", "#000000"] },
  { id: "punk", name: "Punk Riso", desc: "DIY zine: condensed ransom headings, thick borders, fluoro-pink offset shadows.", swatch: ["#f7f3e8", "#ff48b0", "#000000", "#141414"] },
  { id: "editorial", name: "Editorial", desc: "Broadsheet: elegant serif, hairline rules, ink black + press red, no shadows.", swatch: ["#fbfaf5", "#b23a2e", "#2b4a6f", "#1a1a1a"] },
  { id: "bubblegum", name: "Bubblegum", desc: "Soft pop: rounded type, pillowy shadows, candy pink + lilac, bouncy buttons.", swatch: ["#fff2f9", "#ff5fa2", "#a78bfa", "#5a2d49"] },
  { id: "pixel", name: "Pixel Arcade", desc: "8-bit: pixel font, chunky borders, stepped hard shadows, arcade primaries.", swatch: ["#f3f1e0", "#e63946", "#2d6cdf", "#1b1b2e"] },
  { id: "deco", name: "Deco Luxe", desc: "Art deco: thin geometric caps, double gold rules, emerald + brass elegance.", swatch: ["#f6f2e7", "#b8923f", "#1e6b54", "#1d3b32"] },
  { id: "cyber", name: "Cyber HUD", desc: "Sci-fi interface: Orbitron caps, notched corners, cyan + magenta, mono body.", swatch: ["#eef3f6", "#0bb6cf", "#ff3d8b", "#0a2a33"], dark: true },
  { id: "win95", name: "Back to 95", desc: "Retro desktop: silver 3D-bevelled panels & buttons, teal background, navy highlights.", swatch: ["#008080", "#c0c0c0", "#000080", "#000000"] },
  { id: "amber", name: "Amber CRT", desc: "Phosphor terminal: VT323, scanlines + glow, amber monochrome. Amber-on-paper by day.", swatch: ["#0d0b06", "#ffb000", "#9fd84a", "#f4ead2"], dark: true },
  { id: "lcars", name: "Flight Deck", desc: "Starship console: rounded pill bars, big readable caps, amber + azure on black.", swatch: ["#06080f", "#eaa83b", "#56b6d8", "#ffffff"], dark: true },
  { id: "teletext", name: "Retro Telly", desc: "Broadcast mosaic: blocky VT323, flat saturated colour blocks on black, double-height heads.", swatch: ["#000000", "#ffff00", "#00ffff", "#00ff00"], dark: true },
  { id: "terminal", name: "Intelligence Terminal", desc: "Trading desk: IBM Plex Mono, dense amber data grid, green-up / red-down, cyan links.", swatch: ["#0a0a0a", "#ff9500", "#33d17a", "#ff4d4d"], dark: true },
  { id: "mac", name: "Return of the Mac", desc: "Black-&-white rounded windows, pinstripe title bars, system sans, inverted selection.", swatch: ["#b8b8b8", "#000000", "#ffffff", "#000088"] },
  { id: "vector", name: "Vector Wireframe", desc: "Neon wireframe: Chakra Petch caps, glowing outline-only panels, transparent fills. Blueprint by day.", swatch: ["#000308", "#34e2e2", "#ff5fa2", "#eef2f8"], dark: true },
  { id: "fairlight", name: "Fairplay", desc: "Green-phosphor music workstation: VT323, scanlines, inverted green header bars, green on black.", swatch: ["#000400", "#2dffa6", "#7affd0", "#0a8a4a"], dark: true },
  { id: "swiss", name: "Bauhaus", desc: "International Typographic: big Archivo grotesque, hairline rules, stark white, single gold accent.", swatch: ["#f0f0ee", "#c8960a", "#0a0a0a", "#6a6a6a"] },
  { id: "darkside", name: "Dark Side", desc: "Imperial battle-station HUD: black command console, Sith-red readouts, cold blue data, angular mono caps.", swatch: ["#05060a", "#ff2b2b", "#46b6e6", "#e9ebf2"], dark: true },
  { id: "system1", name: "Monochrome '84", desc: "Early 1-bit personal computer: stark black & white, square white windows on a grey desktop, crisp system type, hard 1px drop shadows, inverted selection.", swatch: ["#c8c8c8", "#000000", "#ffffff", "#000000"] },
  { id: "system7", name: "Desktop '91", desc: "When desktops got colour: black & white window chrome on a teal desktop, with teal + red accents.", swatch: ["#6d8a96", "#0e8a9c", "#d72a2a", "#000000"] },
  { id: "bitmap", name: "Bitmap", desc: "1-bit dithered art: fine halftone dot desktop, Silkscreen pixel heads, stark high-contrast mono, chunky shadows.", swatch: ["#ffffff", "#000000", "#7a7a7a", "#000000"] },
  { id: "next", name: "Cube", desc: "Chiseled workstation: grey beveled panels, Helvetica, steel-blue selection. Charcoal at night.", swatch: ["#9a9a9a", "#33558c", "#1c1c1c", "#d6d6d6"] },
  { id: "beos", name: "Yellow Tab", desc: "Clean late-90s desktop: yellow tab title-bars, white panels, teal accent, friendly sans.", swatch: ["#d4d0c8", "#f4c000", "#1f8a9a", "#1a1a1a"] },
  { id: "risc", name: "Archimedes", desc: "Cream desktop with colourful 3D slabbed panels: orange + blue accents, rounded bevels.", swatch: ["#b4ac9c", "#d05a1a", "#1a6fb0", "#2a2a2a"] },
  { id: "irix", name: "Indigo", desc: "Bold workstation: saturated indigo, hard offset shadows, orange highlights, heavy sans.", swatch: ["#13162a", "#7e8cff", "#ff9a3a", "#cfd6ff"], dark: true },
  { id: "win31", name: "Tiles '92", desc: "Early desktop: teal background, grey 3D-bevelled panels, navy title bars, MS-sans type.", swatch: ["#008080", "#000080", "#c0c0c0", "#000000"] },
  { id: "cde", name: "Motif", desc: "Steel-blue Unix workstation: chiseled etched panels, grey-blue palette, Helvetica.", swatch: ["#8a98a6", "#3a5a7a", "#7a5a8a", "#161c22"] },
];

export const FONT_SIZES: { id: FontSize; label: string }[] = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Default" },
  { id: "lg", label: "Large" },
  { id: "xl", label: "Extra large" },
];

function root() { return document.documentElement; }

export function getSkin(): Skin {
  try { return (localStorage.getItem(SKIN_KEY) as Skin) || "default"; } catch { return "default"; }
}
export function getFontSize(): FontSize {
  try { return (localStorage.getItem(FONT_KEY) as FontSize) || "md"; } catch { return "md"; }
}

export function applySkin(s: Skin) {
  if (s === "default") root().removeAttribute("data-skin");
  else root().setAttribute("data-skin", s);
}
export function applyFontSize(f: FontSize) {
  if (f === "md") root().removeAttribute("data-fontsize");
  else root().setAttribute("data-fontsize", f);
}

// Custom skin order for the settings grid (drag-to-reorder). Saved ids that no
// longer exist are dropped; newly added skins are appended in their default spot.
export function getSkinOrder(): Skin[] {
  let saved: string[] = [];
  try { saved = JSON.parse(localStorage.getItem(SKIN_ORDER_KEY) || "[]"); } catch {}
  const valid = SKINS.map((s) => s.id);
  const ordered = saved.filter((id): id is Skin => (valid as string[]).includes(id));
  for (const id of valid) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}
export function setSkinOrder(ids: Skin[]) {
  try { localStorage.setItem(SKIN_ORDER_KEY, JSON.stringify(ids)); } catch {}
}

export function setSkin(s: Skin) {
  try { localStorage.setItem(SKIN_KEY, s); } catch {}
  applySkin(s);
  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT));
}
export function setFontSize(f: FontSize) {
  try { localStorage.setItem(FONT_KEY, f); } catch {}
  applyFontSize(f);
  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT));
}
