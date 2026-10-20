/* Etapas do assistente de criação de influencer. Cada grupo de traços
   (src/data/traits.ts) pertence a exatamente uma etapa; a cobertura é
   verificada em tests/influencer-wizard.test.mjs. As opções continuam
   condicionadas ao tipo de personagem via groupsFor/optionsFor. */

import type { CharacterTier } from "./character-types";
import { groupsFor, type TraitGroup } from "./traits";

export type WizardStepId = "identity" | "appearance" | "face" | "style";

export type WizardStep = {
  id: WizardStepId;
  label: string;
  /** Rótulo curto para o indicador compacto do celular. */
  short: string;
  description: string;
  /** Ids dos grupos de traços exibidos na etapa (vazio na identidade). */
  groups: readonly string[];
};

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: "identity",
    label: "Identidade",
    short: "Identidade",
    description: "Nome, foto de referência opcional e o tipo de personagem.",
    groups: [],
  },
  {
    id: "appearance",
    label: "Aparência",
    short: "Aparência",
    description: "Gênero, corpo, etnia, idade, cor da pele, altura e proporções.",
    groups: ["gender", "body_type", "ethnicity_origin_base", "age", "skin_tone", "height", "proportions"],
  },
  {
    id: "face",
    label: "Rosto e cabelo",
    short: "Rosto",
    description: "Cabelo, cabeça, pescoço, olhos, traços e barba.",
    groups: ["hair", "hair_colour", "freak_head", "freak_neck", "eye_shape", "eye_color", "freak_face", "facial_hair"],
  },
  {
    id: "style",
    label: "Estilo e revisão",
    short: "Estilo",
    description: "Estilo, marcas registradas, acessórios, roupa e a revisão final.",
    groups: ["aesthetic", "distinctive", "accessory"],
  },
];

/** Etapas do modo "Imagem + prompt": fluxo curto, só com o que esse modo usa. */
export const PROMPT_STEPS = [
  { id: "image", label: "Imagem", short: "Imagem", description: "A foto do personagem e o nome." },
  { id: "prompt", label: "Descrição e revisão", short: "Descrição", description: "Como o influencer deve ficar, e a revisão final." },
] as const;

/** Grupos de uma etapa que existem para o tipo escolhido, na ordem do catálogo. */
export function stepGroupsFor(step: WizardStep, tier: CharacterTier): TraitGroup[] {
  const available = groupsFor(tier);
  return step.groups.flatMap((id) => available.filter((group) => group.id === id));
}
