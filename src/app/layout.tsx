import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const ui = Geist({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const grotesk = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  icons: { icon: [{ url: "/app-icon.svg", type: "image/svg+xml" }, { url: "/app-icon-v2-1024.png", type: "image/png" }], apple: "/app-icon-v2-1024.png" },
  title: {
    default: "Máquina de Influencers — Personagens e vídeos de IA",
    template: "%s — Máquina de Influencers",
  },
  description:
    "Crie personagens de IA, explore referências e prepare seus vídeos em um só estúdio. Confira os custos de geração e desenvolva seu processo com guias práticos.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#fafaf7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /* translate="no": o app já é PT-BR; o auto-tradutor do Chrome reescreve o
       DOM e quebra a hidratação do React (textos somem nos accordions). */
    <html lang="pt-BR" translate="no" data-theme="light" suppressHydrationWarning className={`${ui.variable} ${grotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{document.documentElement.dataset.theme=localStorage.getItem('mi-theme-v2')==='dark'?'dark':'light'}catch(e){}})();` }} />
        <meta name="google" content="notranslate" />
        {/* Os temas nativos dispensam reprocessamento por extensões. */}
        <meta name="darkreader-lock" />
      </head>
      <body>{children}</body>
    </html>
  );
}
