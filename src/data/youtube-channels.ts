/* Canais do YouTube lidos pelo feed público (youtube.com/feeds/videos.xml),
   sem chave e sem cota. Curadoria manual: só canais brasileiros que publicam
   Shorts virais feitos com IA; o feed traz os 15 envios mais recentes de cada
   canal, com visualizações. Para trocar a lista, basta editar aqui. */

export type YoutubeChannel = { id: string; name: string };

/* Curadoria de 2026-10-21: títulos em português, Shorts no feed, envio recente
   e vídeos de IA no formato que viraliza no Brasil (novela das frutas, Rumi,
   bebês e vovós de IA, paródias, humor). Ficaram de fora canais em inglês ou
   espanhol, tutoriais e cursos, e os que não deixam claro que o vídeo é de IA. */
export const YOUTUBE_AI_CHANNELS: readonly YoutubeChannel[] = [
  { id: "UCPJVLfFIK25bWEYYzAdv7qA", name: "ToonVerseIA" },
  { id: "UC9ovZNfCpUGANQeYAx0MDKQ", name: "Phantom FC" },
  { id: "UCq-9ZGcIjBCXGwTjFyUs6VQ", name: "AnimaToonIA" },
  { id: "UC6GUHR-GQ_PiyXKxf1JONkQ", name: "Comida Falante Fit" },
  { id: "UCFsE96z0W3ZxOv9yOpeezkw", name: "BoquenilceOficial" },
  { id: "UC2HGllodnH9Ato2XhMww4dw", name: "BOQUENILCE" },
  { id: "UCuSRxi6iJsLijufOc-KD7tQ", name: "BOQUENILCE FLIX" },
  { id: "UCoge9w5zvzCXp_ZJiD-S1gQ", name: "Laerte Ia" },
  { id: "UC8lKSH5nzL7wPeJba7hM6UQ", name: "Piadas IA br" },
  { id: "UCgkchlOIk3fZ5Ww363yiY2A", name: "DR_Artificial" },
  { id: "UCelcK8D6-WaB2-sZIk4oouA", name: "O Diário oficial" },
  { id: "UCzHTPJGdvOKIYPaWdPIp-RA", name: "LindIA" },
  { id: "UCmzQYxgA9nrWJwy5Hrxc5cg", name: "IA com Humor" },
  { id: "UCwBewRhDozV-EaM1PkmXyIw", name: "JoãoEmariaAI_BR" },
  { id: "UC4x54GkPxtyplzYmSCTUs2A", name: "Serie de Frutas" },
];

/** Só entra no acervo (e na tela) o Short que já viralizou no canal. */
export const YOUTUBE_MIN_VIEWS = 10_000;

export const YOUTUBE_AI_CHANNEL_IDS: ReadonlySet<string> = new Set(YOUTUBE_AI_CHANNELS.map((channel) => channel.id));
