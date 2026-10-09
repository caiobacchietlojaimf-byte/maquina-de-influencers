import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  icons: { icon: "/app-icon-1024.png", apple: "/app-icon-1024.png" },
  title: {
    default: "Máquina de Influencers — Personagens e vídeos de IA",
    template: "%s — Máquina de Influencers",
  },
  description:
    "Crie personagens de IA, explore referências e prepare seus vídeos em um só estúdio. Confira os custos de geração e desenvolva seu processo com guias práticos.",
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0a0a0b" }, { media: "(prefers-color-scheme: light)", color: "#f6f7f3" }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /* translate="no": o app já é PT-BR; o auto-tradutor do Chrome reescreve o
       DOM e quebra a hidratação do React (textos somem nos accordions). */
    <html lang="pt-BR" translate="no" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${grotesk.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('mi-theme-v1');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){}})();` }} />
        <meta name="google" content="notranslate" />
        {/* Os temas nativos dispensam reprocessamento por extensões. */}
        <meta name="darkreader-lock" />
      </head>
      <body>{children}</body>
    </html>
  );
}
