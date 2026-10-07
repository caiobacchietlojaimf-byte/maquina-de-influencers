/* Vídeos do carrossel hero do estúdio (mesmos 5 do Higgsfield), servidos do
   CDN original — mantém o deploy leve e o visual idêntico. */

const CDN = "https://static.higgsfield.ai/ai-influencer/hero/2026-10-04";

export const HERO_VIDEOS = [
  { src: `${CDN}/cream-shirt.mp4`, poster: `${CDN}/cream-shirt-poster.webp` },
  { src: `${CDN}/cream-tuxedo.mp4`, poster: `${CDN}/cream-tuxedo-poster.webp` },
  { src: `${CDN}/red-bob.mp4`, poster: `${CDN}/red-bob-poster.webp` },
  { src: `${CDN}/green-suit.mp4`, poster: `${CDN}/green-suit-poster.webp` },
  { src: `${CDN}/burgundy-suit-dancer.mp4`, poster: `${CDN}/burgundy-suit-dancer-poster.webp` },
] as const;
