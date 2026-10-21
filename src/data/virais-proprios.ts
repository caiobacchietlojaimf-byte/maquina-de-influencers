/* Virais gerados pela própria Máquina de Influencers (versão anterior do
   produto), servidos de public/virais. */

export type ViralProprio = {
  slug: string;
  title: string;
  description: string;
  people: number;
  poster: string;
  status: "hot" | "new" | "soon";
};

const v = (slug: string, title: string, description: string, people: number, status: ViralProprio["status"], poster = `${slug}.jpg`): ViralProprio =>
  ({ slug, title, description, people, poster: `/virais/${poster}`, status });

export const VIRAIS_PROPRIOS: readonly ViralProprio[] = [
  v("the-box", "The Box", "4 amigos no beatbox — um vídeo só, em duas partes", 4, "hot", "the-box-thumb.jpg"),
  v("roadtrip-vibes", "Roadtrip Vibes", "3 amigos no clipe do estacionamento ao pôr do sol", 3, "hot"),
  v("hotel-lobby", "Hotel Lobby", "2 pessoas na trend do saguão do hotel", 2, "new"),
  v("rain-dance", "Rain Dance", "2 pessoas no clipe à beira d'água", 2, "new"),
  v("spotlight", "Spotlight", "2 amigos: um assiste do bar, o outro rouba a cena no palco", 2, "new"),
  v("cowboy-crew", "Cowboy Crew", "4 amigos de chapéu no passinho do baile", 4, "new"),
  v("yame-becane", "Yamê – Bécane", "Você vira o cantor no microfone do estúdio", 1, "soon"),
  v("poker-face", "Poker Face", "2 pessoas na reação dentro do carro", 2, "soon"),
  v("tray-catch", "Spider Sense", "2 pessoas no salvamento da bandeja no refeitório", 2, "soon"),
  v("fight-me", "Tenta Sorte", "3 pessoas na briga do beco", 3, "soon"),
  v("you-vs-you", "Você vs Você", "Frente a frente com você mesmo, anos depois", 1, "soon"),
];

export const viralVideo = (slug: string) => `/virais/${slug}.mp4`;
