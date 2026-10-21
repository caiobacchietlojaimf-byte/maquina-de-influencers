/* Canais do YouTube lidos pelo feed público (youtube.com/feeds/videos.xml),
   sem chave e sem cota. Curadoria manual: só canais que publicam Shorts de
   personagens ou influencers de IA; o feed traz os 15 envios mais recentes
   de cada canal, com visualizações. Para trocar a lista, basta editar aqui. */

export type YoutubeChannel = { id: string; name: string };

/* Curadoria de 2026-10-21: feed respondendo, envio nos últimos 45 dias e
   títulos de personagem/influencer de IA, com Shorts no feed (tutoriais,
   cursos e canais só de vídeo longo ficaram de fora). */
export const YOUTUBE_AI_CHANNELS: readonly YoutubeChannel[] = [
  { id: "UCEJOtlL7JpjmxMTuPsDRoSg", name: "Lara Valença" },
  { id: "UCjJ0mgpTjNQOyOrgTxCEV5A", name: "DudaLyma IA Influencer" },
  { id: "UCwBewRhDozV-EaM1PkmXyIw", name: "JoãoEmariaAI_BR" },
  { id: "UC4x54GkPxtyplzYmSCTUs2A", name: "Serie de Frutas" },
  { id: "UC0JDuvhO2gSwN6fodqB4mfA", name: "IA NA RESENHA" },
  { id: "UCdKiXn8fffvN5gt4u9WeNtg", name: "Toin i.a" },
  { id: "UCPJVLfFIK25bWEYYzAdv7qA", name: "ToonVerseIA" },
  { id: "UC8V9Hlob17z2XwDY4TLI87Q", name: "Mia Rose | AI Influencer" },
  { id: "UCpePkTLGTpabvr4hEUvl34Q", name: "Mayra AI | Virtual Influencer" },
  { id: "UCc6EbjyMRGNhRHyUUAeqYZw", name: "AI Influencer by Darla H. Cooper" },
  { id: "UCyb2lwVcXWP48FnHvR05D7A", name: "QueenAI" },
  { id: "UCEG-hkC-wrWsEuPEn1b2lOw", name: "Anna. Ai. Lifestyle Influencer" },
  { id: "UCSIZt8JNpWHCZyMtPea1Iig", name: "Talitha Koum Bennett" },
  { id: "UCWYSIzP4z5JN8DoYUsXqIkg", name: "Ashley Monroe Ai Cop" },
  { id: "UCMihPt3yyuGRaPOlChPKQ9w", name: "Aira Around the World" },
  { id: "UCAFSggwyvcUs7UhHxe4q_HA", name: "Maya / Virtual Influencer" },
  { id: "UCih8k6HGZZCOgyUsgVwDIFQ", name: "Nika Storm" },
  { id: "UC4lff59jWxbSlBHSXNJIKzA", name: "VogueVision AI" },
  { id: "UCML6I5OGBpL1VjOmKqepJvA", name: "USA AI Baby" },
  { id: "UClvGHurN2ZlF-nsH_ZBXpuw", name: "Fruta Drama" },
  { id: "UCtoR90lvWQzJN-K1CPmgJaA", name: "AI Baby space" },
];

export const YOUTUBE_AI_CHANNEL_IDS: ReadonlySet<string> = new Set(YOUTUBE_AI_CHANNELS.map((channel) => channel.id));
