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

export function buildBrief(tier: CharacterTier, selection: Selection, references: { identity?: boolean; style?: boolean; prompt?: string } = {}): string {
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
  if (references.identity) parts.push("Use the identity reference to preserve recognizable facial identity, adapted only to the selected character type and traits. Its existing clothes are not a clothing instruction: replace them with the requested outfit.");
  if (references.style) parts.push("Use the item reference for clothing, colors and styling; do not replace the character's identity with a person from that image. The item reference takes precedence over the generic aesthetic trait.");
  if (references.prompt?.trim()) parts.push(`Explicit user instructions (highest priority for requested clothing and corrections; override conflicting generic traits and clothing in the identity photo): ${references.prompt.trim()}`);
  parts.push("Render the requested garments faithfully, with the same outfit in both panels. Do not default to a suit or reinterpret a casual outfit as formal tailoring.");
  return parts.join(" ");
}

/** Image-to-image instructions: only the user's requested attributes may change. */
export function buildInfluencerEditPrompt(prompt: string, kind: "outfit" | "details", hasStyleReference = false): string {
  return [
    "Edit image 1 directly. It is the source character, not an inspiration for a new person.",
    kind === "outfit"
      ? "Change ONLY the clothing and explicitly requested clothing accessories. Preserve the exact same face, facial features, skin tone, hairstyle, hair color, body proportions, age, expression and character identity."
      : "Apply ONLY the specific corrections requested below. Preserve the character's recognizable identity and every attribute that the user did not request to change.",
    "Keep the original composition, number of panels, camera angles, pose, background, lighting and image framing. If there are multiple views, update all views consistently to show the same person and outfit. Do not add text, logos, additional characters or new panels.",
    ...(hasStyleReference ? ["Image 2 is a wardrobe/style reference ONLY. Reproduce its requested clothing materials, cut and colors on the character in image 1. Never copy a face or body identity from image 2."] : []),
    `Requested changes: ${prompt.trim()}`,
    "Preservation of all unrequested features has priority. Deliver a single finished edited image.",
  ].join(" ");
}

export function buildInfluencerPromptBrief(prompt: string, hasStyleReference = false): string {
  return [
    "Create a photoreal character reference sheet using the person in image 1 as the identity reference. Preserve recognizable facial identity and all features not explicitly requested to change.",
    "Two-panel sheet: left a frontal close-up portrait including the entire head and hair, right a full-body standing view with hands and feet visible. Show the exact same person and outfit in both views, pure white seamless background, bright soft studio lighting, crisp natural detail. No text or labels.",
    ...(hasStyleReference ? ["Image 2 is a clothing/style reference only; never transfer its person's face or identity."] : []),
    `Follow these user instructions precisely; the requested clothes override those in image 1: ${prompt.trim()}`,
    "Do not invent different garments, substitute formal clothing for casual clothing, or apply an unrelated preset character style.",
  ].join(" ");
}

/** Prompt de duplicação de um vídeo viral para o influencer do usuário. */
export function buildViralPrompt(effectName: string, effectDescriptionEn: string, extra?: string): string {
  const base = `Recreate the viral "${effectName}" video with the character from @image1 as the subject: ${effectDescriptionEn} Keep the exact camera movement, timing and energy of the trend; same framing and pacing, new protagonist.`;
  return extra?.trim() ? `${base} ${extra.trim()}` : base;
}
