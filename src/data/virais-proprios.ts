/* Virais gerados pela própria Máquina de Influencers (versão anterior do
   produto), servidos de public/virais. Cada um vira um template: o visitante
   envia uma foto por pessoa, na ordem das caixas. */

export type FotoSlot = { label: string; hint: string };

export type ViralProprio = {
  slug: string;
  title: string;
  description: string;
  people: number;
  poster: string;
  status: "hot" | "new" | "soon";
  slots: readonly FotoSlot[];
};

const s = (label: string, hint: string): FotoSlot => ({ label, hint });

const v = (slug: string, title: string, description: string, people: number, status: ViralProprio["status"], slots: readonly FotoSlot[] = [], poster = `${slug}.jpg`): ViralProprio =>
  ({ slug, title, description, people, poster: `/virais/${poster}`, status, slots });

export const VIRAIS_PROPRIOS: readonly ViralProprio[] = [
  v("the-box", "The Box", "4 amigos no beatbox — um vídeo só, em duas partes", 4, "hot", [
    s("Quem canta a 1ª parte", "No microfone, do começo à metade"),
    s("Quem canta a 2ª parte", "No microfone, da metade ao fim"),
    s("Pessoa 3", "Abre a 2ª parte e aparece ao fundo"),
    s("Pessoa 4", "Abre a 1ª parte e aparece ao fundo"),
  ], "the-box-thumb.jpg"),
  v("roadtrip-vibes", "Roadtrip Vibes", "3 amigos no clipe do estacionamento ao pôr do sol", 3, "hot", [
    s("Pessoa 1", "Quem dança de roxo no começo"),
    s("Pessoa 2", "Quem segura a câmera (selfie)"),
    s("Pessoa 3", "Quem sai do carro cinza"),
  ]),
  v("hotel-lobby", "Hotel Lobby", "2 pessoas na trend do saguão do hotel", 2, "new", [
    s("Pessoa 1", "À esquerda — camisa listrada"),
    s("Pessoa 2", "À direita — camisa laranja"),
  ]),
  v("rain-dance", "Rain Dance", "2 pessoas no clipe à beira d'água", 2, "new", [
    s("Pessoa 1", "Sentada no píer e na praia"),
    s("Pessoa 2 · A estrela", "Aparece na maior parte do vídeo"),
  ]),
  v("spotlight", "Spotlight", "2 amigos: um assiste do bar, o outro rouba a cena no palco", 2, "new", [
    s("Pessoa 1", "Quem assiste do bar"),
    s("Pessoa 2 · A estrela", "Quem dança no palco"),
  ]),
  v("cowboy-crew", "Cowboy Crew", "4 amigos de chapéu no passinho do baile", 4, "new", [
    s("Pessoa 1", "Na ponta esquerda, chapéu claro e sem paletó"),
    s("Pessoa 2", "2º da esquerda, chapéu preto"),
    s("Pessoa 3", "3º da esquerda, chapéu preto"),
    s("Pessoa 4", "Na ponta direita, chapéu claro"),
  ]),
  v("yame-becane", "Yamê – Bécane", "Você vira o cantor no microfone do estúdio", 1, "soon"),
  v("landed-in-brooklyn", "Landed in Brooklyn", "Você vira o vocalista no estúdio do Brooklyn", 1, "soon"),
  v("poker-face", "Poker Face", "2 pessoas na reação dentro do carro", 2, "soon"),
  v("doja-rap", "Doja", "Uma foto e o clipe inteiro é seu", 1, "soon"),
  v("tray-catch", "Spider Sense", "2 pessoas no salvamento da bandeja no refeitório", 2, "soon"),
  v("fight-me", "Tenta Sorte", "3 pessoas na briga do beco", 3, "soon"),
  v("you-vs-you", "Você vs Você", "Frente a frente com você mesmo, anos depois", 2, "soon"),
];

export const viralVideo = (slug: string) => `/virais/${slug}.mp4`;
export const getViral = (slug: string) => VIRAIS_PROPRIOS.find((item) => item.slug === slug);
