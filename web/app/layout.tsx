import type { Metadata } from "next";
import { Space_Grotesk, Fraunces, JetBrains_Mono, Anton, Fredoka, Silkscreen, Poiret_One, Orbitron, Roboto_Mono, Rajdhani, IBM_Plex_Mono, Chakra_Petch, Archivo } from "next/font/google";
import AppHeader from "@/components/AppHeader";
import AutoRefresh from "@/components/AutoRefresh";
import MobileTabBar from "@/components/MobileTabBar";
import RadioSidebar from "@/components/RadioSidebar";
import "./globals.css";

// Skin fonts (self-hosted by next/font; referenced by data-skin rules in globals.css).
const neoFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-neo", display: "swap" });
const serifFont = Fraunces({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const techFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-tech", display: "swap" });
const punkFont = Anton({ subsets: ["latin"], weight: "400", variable: "--font-punk", display: "swap" });
const vtFont = Roboto_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-vt", display: "swap" });
const lcarsFont = Rajdhani({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-lcars", display: "swap" });
const plexFont = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-plex", display: "swap" });
const vectorFont = Chakra_Petch({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-vector", display: "swap" });
const swissFont = Archivo({ subsets: ["latin"], variable: "--font-swiss", display: "swap" });
const bubbleFont = Fredoka({ subsets: ["latin"], variable: "--font-bubble", display: "swap" });
const pixelFont = Silkscreen({ subsets: ["latin"], weight: "400", variable: "--font-pixel", display: "swap" });
const decoFont = Poiret_One({ subsets: ["latin"], weight: "400", variable: "--font-deco", display: "swap" });
const cyberFont = Orbitron({ subsets: ["latin"], variable: "--font-cyber", display: "swap" });

// Apply theme + skin + display size before first paint (no flash of unstyled appearance).
// data-theme="light" is set as the SSR default on <html>; the script only removes it for
// users who have explicitly chosen dark mode, and applies any saved skin/size overrides.
const APPEARANCE_INIT = `try{var d=document.documentElement;
if(localStorage.getItem('jotter.theme.v2')==='dark')d.removeAttribute('data-theme');
var s=localStorage.getItem('jotter.skin.v1');if(s&&s!=='default')d.setAttribute('data-skin',s);
var f=localStorage.getItem('jotter.fontsize.v1');if(f&&f!=='md')d.setAttribute('data-fontsize',f);
}catch(e){}`;

export const metadata: Metadata = {
  title: "Jotter Intelligence — Foresight Engine",
  description: "Turning the world's sharpest minds into thought leadership.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${neoFont.variable} ${serifFont.variable} ${techFont.variable} ${punkFont.variable} ${bubbleFont.variable} ${pixelFont.variable} ${decoFont.variable} ${cyberFont.variable} ${vtFont.variable} ${lcarsFont.variable} ${plexFont.variable} ${vectorFont.variable} ${swissFont.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT }} />
      </head>
      <body className="min-h-screen flex">
        {/* AutoRefresh runs the Python engine on page load in local dev.
            In production DATA_URL is set, so the nightly Action handles refreshes instead. */}
        {!process.env.DATA_URL && <AutoRefresh />}
        <RadioSidebar />
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <AppHeader />
        {/* extra bottom padding ≤md clears the fixed tab bar + radio mini-player */}
        <main className="mx-auto w-full max-w-6xl px-5 py-8 flex-1 max-md:pb-32">{children}</main>
        </div>
        <MobileTabBar />
      </body>
    </html>
  );
}
