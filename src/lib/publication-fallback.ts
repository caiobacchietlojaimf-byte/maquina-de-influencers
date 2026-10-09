import type { PublicationContext } from "./publication-context";
import type { PublicationSuggestion } from "./publication-assistant-types";
import type { CaptionGoal } from "./publish-caption";

/** A disclosed draft when vision is unavailable; never pretends to watch media. */
export function publicationFallback(videoId: string, context: PublicationContext, goal: CaptionGoal, notice: string): PublicationSuggestion {
  const scene = `${context.sourceTitle ?? ""} ${context.sceneDescription ?? ""}`.toLocaleLowerCase("pt-BR");
  const known = context.matchedBy !== "none" && !context.descriptionIsProposal;
  const theme = known && /currency showoff|cena de luxo|dinheiro/.test(scene) ? {
    hooks: ["Meu conceito de discrição precisa de revisão. 😂", "Eu tentando passar despercebido.", "A pose de quem levou o personagem a sério demais."],
    question: "Essa pose combina mais com o começo ou com o fim do mês?", keywords: ["humor", "ostentação", "personagem"], tags: ["#Humor", "#Ostentação", "#Comédia"],
  } : known && /supercar interior|night fuel|carro/.test(scene) ? {
    hooks: ["Saí para dar uma volta. A pose foi junto.", "Eu levo a pose a sério até no carro.", "Tem gente que escolhe o destino. Eu começo pela pose."],
    question: "Qual música combina com essa entrada?", keywords: ["carro", "estilo", "humor"], tags: ["#Carros", "#Estilo", "#Humor"],
  } : known && /dança|dance|performance completa|sequência viral/.test(scene) ? {
    hooks: ["A coreografia é uma. Minha confiança é outra. 😂", "Eu disse que sabia os passos. Agora preciso sustentar.", "Cheguei na coreografia com mais atitude do que ensaio."],
    question: "Você entraria na coreografia ou ficaria só na torcida?", keywords: ["dança", "coreografia", "humor"], tags: ["#Dança", "#Coreografia", "#Humor"],
  } : {
    hooks: ["Eu entro em cena. A história fica por sua conta.", "Mais uma cena para o meu repertório.", "Todo personagem tem uma cena que merece continuação."],
    question: "Se essa cena tivesse uma continuação, qual seria?", keywords: ["personagem", "cena", "história"], tags: ["#Personagem", "#Cena", "#Histórias"],
  };
  const cta = goal === "comments" ? theme.question
    : goal === "shares" ? "Envie para quem entraria nessa cena com você."
    : goal === "saves" ? "Salve essa cena como inspiração para sua próxima ideia."
    : "Me acompanhe para ver a próxima cena dessa história.";
  const captions = theme.hooks.map(hook => `${hook}\n\n${cta}\n\n${theme.tags.join(" ")}`);
  return {
    videoId, caption: captions[0], alternatives: captions.slice(1).map((caption, i) => ({ label: `Variação ${i + 2}`, caption })),
    keywords: theme.keywords, hashtags: theme.tags, goal,
    source: {
      title: context.sourceTitle ?? "Vídeo selecionado", kind: context.sourceCaption ? "reference-caption" : known ? "reference-context" : "video-context",
      ...(context.sourcePageUrl ? { url: context.sourcePageUrl } : {}),
      ...(context.sourceMetrics?.observedAt ? { observedAt: context.sourceMetrics.observedAt } : {}),
    },
    method: "context", generatedAt: Date.now(), notice,
  };
}
