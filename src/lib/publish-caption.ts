/** Editorial helpers inspired by sergebulaev/instagram-skills.
 * They assemble editable copy from the user's topic; no performance claims or
 * audience data are generated. Kept free of server imports for preview + tests. */
export const CAPTION_LIMIT = 2200;
export const HOOK_TARGET = 125;

export type CaptionGoal = "comments" | "shares" | "saves" | "follows";

export const CAPTION_GOALS: Record<
  CaptionGoal,
  { label: string; cta: string }
> = {
  comments: {
    label: "Conversar",
    cta: "Qual cena você criaria com esse personagem?",
  },
  shares: {
    label: "Compartilhar",
    cta: "Envie para quem criaria uma versão dessa cena com você.",
  },
  saves: {
    label: "Salvar",
    cta: "Salve a referência para a próxima criação do seu personagem.",
  },
  follows: {
    label: "Atrair seguidores",
    cta: "Acompanhe as próximas cenas desse personagem por aqui.",
  },
};

export function buildCaption(input: {
  topic: string;
  goal: CaptionGoal;
  character?: string;
}): string {
  const topic = input.topic
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "");
  if (!topic) return "";
  const subject = input.character?.trim() || "Meu personagem de IA";
  const hooks: Record<CaptionGoal, string> = {
    comments: `${topic}. Como você continuaria essa cena?`,
    shares: `${subject} em cena: ${topic}.`,
    saves: `Referência para a próxima criação: ${topic}.`,
    follows: `A próxima cena de ${subject}: ${topic}.`,
  };
  return [
    hooks[input.goal],
    "Personagem virtual criado com IA.",
    CAPTION_GOALS[input.goal].cta,
    "#PersonagemIA #InfluencerVirtual #CriacaoComIA",
  ].join("\n\n");
}

export function inspectCaption(caption: string) {
  const text = caption.trim();
  const hook = text.split(/\n/)[0] ?? "";
  const hashtags = [...new Set(text.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
  const emojiCount = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const warnings: string[] = [];
  if (hook.length > HOOK_TARGET)
    warnings.push(
      "Encurte a primeira linha para que o gancho apareça antes de ‘mais’. Use 125 caracteres como referência.",
    );
  if (hashtags.length > 5)
    warnings.push(
      "Experimente 3 a 5 hashtags ligadas ao tema e ao personagem, sem repetir tags genéricas.",
    );
  if (emojiCount > 3)
    warnings.push(
      "Revise os emojis e mantenha apenas os que ajudam a leitura.",
    );
  if (
    /o que (voc[eê]|vc) acha|comente\s+(sim|eu quero)|marque\s+\d+\s+amigos/iu.test(
      text,
    )
  )
    warnings.push(
      "Troque o pedido genérico por uma pergunta específica sobre a cena ou uma única ação útil.",
    );
  if (
    /\[(?:seu|sua|insira|nome|tema)[^\]]*\]|contentReference|oaicite/iu.test(
      text,
    )
  )
    warnings.push("Revise os trechos de modelo que ainda ficaram na legenda.");
  return { hook, hashtags, emojiCount, warnings, length: text.length };
}

/** All dates in the composer are explicitly Brasília (UTC−3). */
export function publishDateValue(timestamp = Date.now()): string {
  return new Date(timestamp - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function parsePublishDate(value: string): number {
  return new Date(`${value}:00-03:00`).getTime();
}
