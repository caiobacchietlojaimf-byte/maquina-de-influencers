import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import { siteUrl } from "@/lib/site-url";
import { Analytics } from "@vercel/analytics/next";

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
  metadataBase: new URL(siteUrl()),
  applicationName: "Máquina de Influencers",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Máquina de Influencers",
    title: "Máquina de Influencers — Crie o influencer. A IA faz o resto.",
    description: "Escolha um viral, coloque você ou o seu influencer de IA e publique no TikTok e no Instagram. Tudo em um só estúdio.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Máquina de Influencers — Crie o influencer. A IA faz o resto.",
    description: "Escolha um viral, coloque você ou o seu influencer de IA e publique no TikTok e no Instagram.",
  },
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
        {/* Síncrono de propósito: aplica o tema antes da primeira pintura. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{document.documentElement.dataset.theme=localStorage.getItem('mi-theme-v2')==='dark'?'dark':'light'}catch(e){}})();` }} />
        <meta name="google" content="notranslate" />
        {/* Os temas nativos dispensam reprocessamento por extensões. */}
        <meta name="darkreader-lock" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
