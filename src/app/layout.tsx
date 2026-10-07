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
  title: {
    default: "Máquina de Influencers — Crie seu influencer de IA viral",
    template: "%s — Máquina de Influencers",
  },
  description:
    "Monte seu influencer de IA com o rosto, corpo e estilo que você quiser. Aplique movimentos virais e gere vídeos prontos para o TikTok e Instagram.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0a0b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
