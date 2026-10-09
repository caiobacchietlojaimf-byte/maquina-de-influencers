/* Os 9 tipos de personagem do AI Influencer Studio. Os ids são os "tiers" da API
   da Higgsfield; os ícones são os mesmos usados no sidebar do estúdio. */

export type CharacterTier =
  | "normal"
  | "freak"
  | "total"
  | "insects"
  | "frogs"
  | "cats"
  | "dogs"
  | "capybaras"
  | "birds";

export type CharacterType = {
  id: CharacterTier;
  label: string;
  labelEn: string;
  icon: string;
  /** Humanos usam etnia/idade/pele; animais não. */
  human: boolean;
};

export const CHARACTER_TYPES: readonly CharacterType[] = [
  { id: "normal", label: "Média", labelEn: "Average", icon: "/influencer-traits/normal.webp", human: true },
  { id: "freak", label: "Audacioso", labelEn: "Bold", icon: "/influencer-traits/freak.webp", human: true },
  { id: "total", label: "Extremo", labelEn: "Extreme", icon: "/influencer-traits/total.webp", human: true },
  { id: "insects", label: "Inseto", labelEn: "Insect", icon: "/influencer-traits/insects.webp", human: false },
  { id: "frogs", label: "Sapo", labelEn: "Frog", icon: "/influencer-traits/frogs.webp", human: false },
  { id: "cats", label: "Gato", labelEn: "Cat", icon: "/influencer-traits/cats.webp", human: false },
  { id: "dogs", label: "Cachorro", labelEn: "Dog", icon: "/influencer-traits/dogs.webp", human: false },
  { id: "capybaras", label: "Roedor", labelEn: "Rodent", icon: "/influencer-traits/capybaras.webp", human: false },
  { id: "birds", label: "Pássaro", labelEn: "Bird", icon: "/influencer-traits/birds.webp", human: false },
];

export function getCharacterType(id: string): CharacterType {
  return CHARACTER_TYPES.find((t) => t.id === id) ?? CHARACTER_TYPES[0];
}
