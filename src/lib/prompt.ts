/* Monta o brief do character sheet a partir da seleção de traços — no mesmo
   formato dos presets oficiais do AI Influencer Studio: foto de casting
   editorial, duas colunas (close frontal + corpo inteiro), fundo branco puro. */

import { getCharacterType, type CharacterTier } from "@/data/character-types";
import { getOption, type Selection } from "@/data/traits";

const TIER_FLAVOR: Record<string, string> = {
  normal:
    "Fashion-editorial casting photo of a striking, photoreal person with contemporary styling.",
  freak:
    "Fashion-editorial freak casting photo of an odd-looking but photoreal person, contemporary styling.",
  total:
    "Fashion-editorial extreme-freak casting photo of a bizarre yet fully photoreal person, exaggerated anatomy rendered with complete realism.",
  insects:
    "Fashion-editorial casting photo of a photoreal anthropomorphic insect-headed person: a hyper-detailed realistic insect head on a human body, in contemporary styling.",
  frogs:
    "Fashion-editorial casting photo of a photoreal anthropomorphic frog-headed person: a hyper-detailed realistic frog head on a human body, in contemporary styling.",
  cats:
    "Fashion-editorial casting photo of a photoreal anthropomorphic cat-headed person: a hyper-detailed realistic cat head on a human body, in contemporary styling.",
  dogs:
    "Fashion-editorial casting photo of a photoreal anthropomorphic dog-headed person: a hyper-detailed realistic dog head on a human body, in contemporary styling.",
  capybaras:
    "Fashion-editorial casting photo of a photoreal anthropomorphic rodent-headed person: a hyper-detailed realistic capybara head on a human body, in contemporary styling.",
  birds:
    "Fashion-editorial casting photo of a photoreal anthropomorphic bird-headed person: a hyper-detailed realistic bird head on a human body, in contemporary styling.",
};

const GROUP_PHRASE: Record<string, (labels: string[]) => string> = {
  gender: (l) => `${l[0]} presenting`,
  body_type: (l) => `${l[0].toLowerCase()} build`,
  hair: (l) => `${l[0].toLowerCase()} hairstyle`,
  hair_colour: (l) => `${l[0].toLowerCase()} hair color`,
  aesthetic: (l) => `${l[0].toLowerCase()} aesthetic outfit`,
  ethnicity_origin_base: (l) => `${l[0]} features`,
  age: (l) => `${l[0].toLowerCase()} age`,
  skin_tone: (l) => `${l[0].toLowerCase()} skin tone`,
  height: (l) => `${l[0].toLowerCase()} height`,
  proportions: (l) => l.map((x) => x.toLowerCase()).join(", "),
  freak_head: (l) => `${l[0].toLowerCase()} head shape`,
  freak_neck: (l) => `${l[0].toLowerCase()} neck`,
  eye_shape: (l) => `${l[0].toLowerCase()} eyes`,
  eye_color: (l) => `${l[0].toLowerCase()} eye color`,
  freak_face: (l) => l.map((x) => x.toLowerCase()).join(", "),
  facial_hair: (l) => (l[0] === "Clean" ? "clean-shaven" : `${l[0].toLowerCase()}`),
  distinctive: (l) => l.map((x) => x.toLowerCase()).join(", "),
  accessory: (l) => {
    const real = l.filter((x) => x !== "None");
    return real.length ? `wearing ${real.map((x) => x.toLowerCase()).join(", ")}` : "";
  },
};

export function buildBrief(tier: CharacterTier, selection: Selection, references: { identity?: boolean; style?: boolean } = {}): string {
  const type = getCharacterType(tier);
  const parts: string[] = [TIER_FLAVOR[tier] ?? TIER_FLAVOR.normal];

  parts.push(
    "Two-panel sheet: left a tight frontal close-up portrait with the entire head and hair in frame, right a full-body standing shot; arms down, blank deadpan expression. PURE WHITE seamless background, bright soft light.",
  );

  const signature: string[] = [];
  for (const [groupId, optionIds] of Object.entries(selection)) {
    if (!optionIds?.length) continue;
    const labels = optionIds
      .map((id) => getOption(groupId, id)?.en)
      .filter((label): label is string => Boolean(label));
    if (!labels.length) continue;
    const phrase = GROUP_PHRASE[groupId]?.(labels) ?? labels.join(", ").toLowerCase();
    if (phrase) signature.push(phrase);
  }
  if (signature.length) parts.push(`Signature: ${signature.join("; ")}.`);
  if (!type.human) {
    parts.push("The animal head blends seamlessly into the human body, fully photoreal, no cartoon rendering.");
  }
  parts.push("Hyper-realistic, natural uniform skin tone, crisp texture, sharp focus.");
  if (references.identity) parts.push("Use the identity reference to preserve recognizable facial identity, adapted only to the selected character type and traits.");
  if (references.style) parts.push("Use the item reference for clothing, colors and styling; do not replace the character's identity with a person from that image.");
  return parts.join(" ");
}

/** Prompt de duplicação de um vídeo viral para o influencer do usuário. */
export function buildViralPrompt(effectName: string, effectDescriptionEn: string, extra?: string): string {
  const base = `Recreate the viral "${effectName}" video with the character from @image1 as the subject: ${effectDescriptionEn} Keep the exact camera movement, timing and energy of the trend; same framing and pacing, new protagonist.`;
  return extra?.trim() ? `${base} ${extra.trim()}` : base;
}
