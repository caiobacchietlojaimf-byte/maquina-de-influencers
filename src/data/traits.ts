/* Grupos de traços do AI Influencer — ids idênticos aos da API da Higgsfield
   (ai_influencer_get_options). `tiers` diz em quais tipos de personagem a opção
   aparece; `max` é quantas opções o grupo aceita. Labels em PT-BR com o
   original em inglês para montar o brief do prompt. */

import type { CharacterTier } from "./character-types";
import { TRAIT_KINDS, TRAIT_MEDIA, TRAIT_RULES } from "./influencer-trait-media";

export type TraitOption = {
  id: string;
  label: string;
  en: string;
  tiers: readonly CharacterTier[];
  /** Preview oficial salvo localmente; cores/itens de texto não inventam uma foto. */
  image?: string;
  imageFit?: "contain" | "cover";
  swatch?: string;
  exclusive?: boolean;
  /** Grupos com slots (ex.: Features) só aceitam uma opção por slot. */
  slot?: string;
};

export type TraitGroup = {
  id: string;
  label: string;
  en: string;
  max: number;
  kind: "media" | "color" | "text";
  options: readonly TraitOption[];
};

const ALL: readonly CharacterTier[] = ["normal", "freak", "total", "insects", "frogs", "cats", "dogs", "capybaras", "birds"];
const HUMAN: readonly CharacterTier[] = ["normal", "freak", "total"];
const FREAKY: readonly CharacterTier[] = ["freak", "total", "insects", "frogs", "cats", "dogs", "capybaras", "birds"];
const FREAK_TOTAL: readonly CharacterTier[] = ["freak", "total"];
const TOTAL: readonly CharacterTier[] = ["total"];
const ANIMALS_TOTAL: readonly CharacterTier[] = ["total", "insects", "frogs", "cats", "dogs", "capybaras", "birds"];

const o = (id: string, label: string, en: string, tiers: readonly CharacterTier[] = ALL, slot?: string): TraitOption =>
  ({ id, label, en, ...(slot ? { slot } : {}), ...TRAIT_MEDIA[id], ...(TRAIT_RULES[id] ?? { tiers }) });

export const TRAIT_GROUPS: readonly TraitGroup[] = [
  {
    id: "gender",
    label: "Gênero",
    en: "Gender",
    max: 1,
    options: [
      o("female", "Feminino", "Female"),
      o("male", "Masculino", "Male"),
      o("trans_man", "Homem trans", "Trans man"),
      o("trans_woman", "Mulher trans", "Trans woman"),
      o("non_binary", "Não-binário", "Non-binary"),
    ],
  },
  {
    id: "body_type",
    label: "Corpo",
    en: "Build",
    max: 1,
    options: [
      o("body_slim", "Magro", "Slim"),
      o("body_athletic", "Atlético", "Athletic"),
      o("body_muscular", "Musculoso", "Muscular"),
      o("body_curvy", "Curvilíneo", "Curvy"),
      o("body_heavy", "Robusto", "Heavy"),
      o("body_ultra", "Ultra musculoso", "Ultra Muscular"),
      o("body_glutes", "Quadris largos", "Big glutes, wide hips"),
      o("pr_centaur", "Centauro", "Centaur", ANIMALS_TOTAL),
    ],
  },
  {
    id: "hair",
    label: "Cabelo",
    en: "Hairstyle",
    max: 1,
    options: [
      o("hs_lampshade", "Chanel", "Bob", FREAKY),
      o("hair_bald", "Careca", "Bald"),
      o("hair_buzz", "Raspado", "Buzz cut"),
      o("hair_bowl", "Cuia", "Bowl cut"),
      o("hair_mullet", "Mullet", "Mullet"),
      o("hair_braids", "Tranças", "Braids"),
      o("hair_pigtails", "Maria-chiquinha", "Pigtails"),
      o("hair_afro", "Afro", "Afro"),
      o("hair_punk", "Moicano", "Mohawk"),
      o("hs_pompadour", "Ondas volumosas", "Volume waves", FREAKY),
      o("hs_beehive", "Colmeia", "Beehive", FREAKY),
      o("hs_dome", "Permanente", "Perm", FREAKY),
      o("hair_long", "Cabelo longo", "Long hair"),
      o("hair_short", "Cabelo curto", "Short hair"),
      o("hs_horns", "Chifres de cabelo", "Hair horns", FREAKY),
      o("hs_softserve", "Espiral sorvete", "Soft-serve swirl", FREAKY),
      o("hs_sphere", "Esfera de cachos", "Curl sphere", FREAKY),
      o("hs_mouse", "Orelhas de rato", "Mouse-ear puffs", FREAKY),
      o("hs_wings", "Asas de cabelo", "Hair wings", FREAKY),
      o("hs_hedgehog", "Espinhos de ouriço", "Hedgehog spikes", FREAKY),
      o("hs_tufts", "Tufos laterais", "Side tufts", FREAKY),
      o("hs_stairs", "Degraus", "Stair steps", FREAKY),
      o("hs_shelf", "Chanel prateleira", "Shelf bob", FREAKY),
      o("hs_corkscrews", "Saca-rolhas", "Corkscrews", FREAKY),
      o("hs_sidecoil", "Espiral lateral", "Side coil", FREAKY),
      o("hs_mushroom", "Cogumelo", "Mushroom", FREAKY),
      o("hs_curlblock", "Cachos em topo reto", "Curly flat-top block", FREAKY),
      o("hs_batwing", "Cuia com asas", "Bat-wing bowl", FREAKY),
      o("hs_spirals", "Cabelo em alças", "Handlebar hair", FREAKY),
      o("hs_periwig", "Peruca barroca", "Baroque wig", FREAKY),
    ],
  },
  {
    id: "hair_colour",
    label: "Cor do cabelo",
    en: "Hair Color",
    max: 1,
    options: [
      o("hc_black", "Preto", "Jet black"),
      o("hc_darkbrown", "Castanho escuro", "Dark brown"),
      o("hc_chestnut", "Castanho", "Chestnut"),
      o("hc_ginger", "Ruivo", "Ginger"),
      o("hc_red", "Vermelho", "Red"),
      o("hc_blonde", "Loiro", "Blonde"),
      o("hc_platinum", "Platinado", "Platinum"),
      o("hc_grey", "Grisalho", "Grey"),
      o("hc_white", "Branco", "White"),
      o("hc_pink", "Rosa pastel", "Pastel pink"),
      o("hc_lilac", "Lilás", "Lilac"),
      o("hc_blue", "Azul", "Blue"),
      o("hc_green", "Verde", "Green"),
    ],
  },
  {
    id: "aesthetic",
    label: "Estilo",
    en: "Style",
    max: 1,
    options: [
      o("retro", "Retrô", "Retro"),
      o("sporty", "Esportivo", "Sporty"),
      o("y2k", "Y2K", "Y2K"),
      o("theatrical", "Teatral", "Theatre"),
      o("goth", "Gótico", "Goth"),
      o("suits", "Ternos", "Suits"),
      o("streetstyle", "Streetstyle", "Streetstyle"),
      o("casual", "Casual", "Casual"),
    ],
  },
  {
    id: "ethnicity_origin_base",
    label: "Etnia",
    en: "Ethnicity",
    max: 1,
    options: [
      o("african", "Africana", "African", HUMAN),
      o("east_asian", "Asiática", "Asian", HUMAN),
      o("european", "Europeia", "European", HUMAN),
      o("indian", "Indiana", "Indian", HUMAN),
      o("middle_eastern", "Oriente Médio", "Middle Eastern", HUMAN),
      o("latin_american", "Mista", "Mixed", HUMAN),
    ],
  },
  {
    id: "age",
    label: "Idade",
    en: "Age",
    max: 1,
    options: [
      o("adult", "Adulto", "Adult", HUMAN),
      o("mature", "Maduro", "Mature", HUMAN),
      o("senior", "Idoso", "Senior", HUMAN),
    ],
  },
  {
    id: "skin_tone",
    label: "Cor da pele",
    en: "Skin color",
    max: 1,
    options: [
      o("st_porcelain", "Porcelana", "Porcelain", HUMAN),
      o("st_fair", "Clara", "Fair", HUMAN),
      o("st_light", "Leve", "Light", HUMAN),
      o("st_olive", "Oliva", "Olive", HUMAN),
      o("st_tan", "Bronzeada", "Tan", HUMAN),
      o("st_brown", "Morena", "Brown", HUMAN),
      o("st_deep", "Marrom escuro", "Deep brown", HUMAN),
      o("st_ebony", "Ébano", "Ebony", HUMAN),
    ],
  },
  {
    id: "height",
    label: "Altura",
    en: "Height",
    max: 1,
    options: [
      o("h_short", "Baixo", "Short", ANIMALS_TOTAL),
      o("h_average", "Média", "Average"),
      o("h_tall", "Alto", "Tall"),
      o("h_very_tall", "Muito alto", "Very tall"),
    ],
  },
  {
    id: "proportions",
    label: "Proporções",
    en: "Proportions",
    max: 2,
    options: [
      o("pr_longlimbs", "Membros longos", "Long limbs"),
      o("pr_shortlegs", "Pernas curtas", "Short legs"),
      o("pr_shoulders", "Ombros largos", "Broad shoulders"),
      o("pr_waist", "Cintura fina", "Tiny waist"),
      o("pr_egg", "Corpo de ovo", "Egg body", FREAKY),
      o("pr_potbelly", "Barriga saliente", "Pot belly", FREAKY),
    ],
  },
  {
    id: "freak_head",
    label: "Formato da cabeça",
    en: "Head shape",
    max: 1,
    options: [
      o("head_oval", "Padrão", "Standard", HUMAN),
      o("head_long", "Longa", "Long", HUMAN),
      o("head_tiny", "Minúscula", "Tiny", FREAK_TOTAL),
      o("head_forehead", "Testa alta", "High forehead", FREAK_TOTAL),
      o("head_ancient", "Homem das cavernas", "Caveman", TOTAL),
      o("head_herojaw", "Gigachad", "Gigachad", TOTAL),
      o("head_megachin", "Mega queixo", "Mega jaw", TOTAL),
      o("head_round", "Redonda", "Round", HUMAN),
      o("head_square", "Quadrada", "Square", HUMAN),
      o("head_heart", "Coração", "Heart", HUMAN),
      o("head_blockjaw", "Maxilar quadrado largo", "Wide square jaw", TOTAL),
    ],
  },
  {
    id: "freak_neck",
    label: "Pescoço",
    en: "Neck",
    max: 1,
    options: [
      o("neck_normal", "Padrão", "Standard", HUMAN),
      o("neck_column", "Coluna", "Column", FREAK_TOTAL),
      o("neck_long", "Longo", "Long", FREAK_TOTAL),
      o("neck_short", "Curto", "Short", HUMAN),
    ],
  },
  {
    id: "eye_shape",
    label: "Formato dos olhos",
    en: "Eye shape",
    max: 1,
    options: [
      o("es_almond", "Amendoado", "Almond", HUMAN),
      o("es_round", "Redondo", "Round", HUMAN),
      o("es_monolid", "Monolid", "Monolid", HUMAN),
      o("es_close", "Juntos", "Close-set", FREAK_TOTAL),
      o("es_wide", "Afastados", "Wide-set", FREAK_TOTAL),
      o("es_uneven", "Desiguais", "Uneven", FREAK_TOTAL),
      o("es_large", "Grandes", "Large", HUMAN),
      o("es_huge", "Enormes", "Huge", FREAK_TOTAL),
      o("es_hooded", "Caídos", "Hooded", HUMAN),
      o("es_upturned", "Puxados para cima", "Upturned", HUMAN),
      o("es_downturned", "Puxados para baixo", "Downturned", HUMAN),
    ],
  },
  {
    id: "eye_color",
    label: "Cor dos olhos",
    en: "Eye color",
    max: 1,
    options: [
      o("eye_black", "Preto", "Black", HUMAN),
      o("eye_brown", "Castanho", "Brown", HUMAN),
      o("eye_hazel", "Avelã", "Hazel", HUMAN),
      o("eye_green", "Verde", "Green", HUMAN),
      o("eye_blue", "Azul", "Blue", HUMAN),
      o("eye_ice_blue", "Azul gelo", "Ice blue", HUMAN),
      o("eye_amber", "Âmbar", "Amber", HUMAN),
      o("eye_grey", "Cinza", "Grey", HUMAN),
    ],
  },
  {
    id: "freak_face",
    label: "Traços",
    en: "Features",
    max: 4,
    options: [
      o("fn_freckles", "Sardas", "Freckles", HUMAN, "marks"),
      o("fn_dimples", "Covinhas", "Dimples", HUMAN, "cheeks"),
      o("fn_eyebags", "Olheiras fundas", "Heavy eye bags", HUMAN, "eyes"),
      o("ff_marks_12", "Blush", "Blush", FREAK_TOTAL, "marks"),
      o("fn_cheekbones", "Maçãs do rosto altas", "High cheekbones", HUMAN, "cheeks"),
      o("fn_fulllips", "Lábios cheios", "Full lips", HUMAN, "lips"),
      o("fn_thickbrows", "Sobrancelhas grossas", "Thick brows", HUMAN, "brows"),
      o("fn_mole", "Pinta", "Beauty mark", HUMAN, "marks"),
      o("ff_nose_0", "Nariz de batata", "Potato nose", FREAK_TOTAL, "nose"),
      o("ff_nose_1", "Nariz de botão", "Button nose", FREAK_TOTAL, "nose"),
      o("ff_nose_2", "Nariz pontudo", "Pointy nose", FREAK_TOTAL, "nose"),
      o("fn_tinynose", "Nariz pequeno", "Tiny nose", HUMAN, "nose"),
      o("ff_lips_3", "Lábios de bico", "Pouty lips", FREAK_TOTAL, "lips"),
      o("ff_lips_4", "Boca franzida", "Tiny pursed mouth", FREAK_TOTAL, "lips"),
      o("fn_widemouth", "Boca larga", "Wide mouth", HUMAN, "lips"),
      o("ff_brows_5", "Monocelha", "Unibrow", FREAK_TOTAL, "brows"),
      o("ff_brows_6", "Sobrancelhas finas altas", "Thin high brows", FREAK_TOTAL, "brows"),
      o("ff_brows_7", "Sobrancelhas escova", "Brush brows", FREAK_TOTAL, "brows"),
      o("ff_ears_8", "Orelhas de abano", "Jug ears", FREAK_TOTAL, "ears"),
      o("ff_ears_9", "Orelhas desiguais", "Uneven ears", FREAK_TOTAL, "ears"),
      o("ff_teeth_10", "Dentes separados", "Gap teeth", FREAK_TOTAL, "teeth"),
      o("ff_teeth_11", "Dentes de coelho", "Buck teeth", FREAK_TOTAL, "teeth"),
      o("fn_pointychin", "Queixo pontudo", "Pointy chin", HUMAN, "chin"),
      o("ff_chin_13", "Queixo fraco", "Weak chin", FREAK_TOTAL, "chin"),
      o("ff_forehead_14", "Testa grande", "Big forehead", FREAK_TOTAL, "forehead"),
      o("fn_arrowbrows", "Sobrancelhas longas e retas", "Long straight eyebrows", HUMAN, "brows"),
      o("fn_flatcheeks", "Maçãs do rosto planas", "Flat cheekbones", HUMAN, "cheeks"),
      o("ff_chin_15", "Queixo longo", "Long chin", FREAK_TOTAL, "chin"),
    ],
  },
  {
    id: "facial_hair",
    label: "Barba",
    en: "Facial hair",
    max: 1,
    options: [
      o("fh_none", "Sem barba", "Clean"),
      o("fh_stubble", "Barba por fazer", "Stubble"),
      o("fh_beard", "Barba cheia", "Full beard"),
      o("fh_goatee", "Cavanhaque", "Goatee"),
      o("fh_moustache", "Bigode", "Moustache"),
      o("fh_pencil", "Bigode fino", "Pencil"),
      o("fh_pushbroom", "Bigode vassoura", "Push-broom", FREAKY),
      o("fh_braid", "Barba trançada", "Braided", FREAKY),
      o("fh_handlebar", "Bigode de guidão", "Handlebar moustache", FREAKY),
    ],
  },
  {
    id: "distinctive",
    label: "Marcas registradas",
    en: "Distinctive features",
    max: 2,
    options: [
      o("df_hetero", "Olhos de cores diferentes", "Odd eyes"),
      o("df_facetattoo", "Tatuagem no rosto", "Face tattoo"),
      o("df_septum", "Piercing", "Piercing"),
      o("df_ears", "Piercing na orelha", "Ear piercing"),
      o("df_slits", "Cortes na sobrancelha", "Brow slits"),
      o("df_bleached", "Descolorido", "Bleached"),
      o("df_nobrows", "Sem sobrancelhas", "No brows"),
      o("df_grill", "Grillz dourado", "Gold grill"),
      o("df_braces", "Aparelho", "Braces"),
      o("df_scar", "Cicatriz na sobrancelha", "Brow scar"),
      o("df_gems", "Pedras no rosto", "Face gems"),
      o("df_elf", "Orelhas de elfo", "Elf ears"),
      o("df_lashes", "Cílios grandes", "Big lashes"),
      o("df_bandage", "Fita no nariz", "Nose tape"),
    ],
  },
  {
    id: "accessory",
    label: "Acessórios",
    en: "Accessories",
    max: 3,
    options: [
      o("acc_none", "Nenhum", "None"),
      o("acc_glasses", "Óculos", "Glasses"),
      o("acc_headphones", "Fones", "Headphones"),
      o("acc_jewelry", "Joias", "Jewelry"),
      o("acc_hat", "Chapéu", "Hat"),
      o("acc_bag", "Bolsa", "Bag"),
    ],
  },
].map(group => ({ ...group, kind: TRAIT_KINDS[group.id] }));

export type Selection = Record<string, string[]>;

/** Opções do grupo visíveis para um tipo de personagem. */
export function optionsFor(group: TraitGroup, tier: CharacterTier): TraitOption[] {
  return group.options.filter((opt) => opt.tiers.includes(tier));
}

/** Grupos que fazem sentido para o tipo (animais não têm etnia/idade/pele…). */
export function groupsFor(tier: CharacterTier): TraitGroup[] {
  return TRAIT_GROUPS.filter((g) => optionsFor(g, tier).length > 0);
}

export function getOption(groupId: string, optionId: string): TraitOption | undefined {
  return TRAIT_GROUPS.find((g) => g.id === groupId)?.options.find((opt) => opt.id === optionId);
}

/** Remove da seleção o que não existe para o tier atual. */
export function pruneSelection(selection: Selection, tier: CharacterTier): Selection {
  const out: Selection = {};
  for (const group of TRAIT_GROUPS) {
    const allowed = new Map(optionsFor(group, tier).map((opt) => [opt.id, opt]));
    const kept: string[] = [], slots = new Set<string>();
    for (const id of selection[group.id] ?? []) {
      const option = allowed.get(id);
      if (!option || kept.includes(id) || (option.slot && slots.has(option.slot))) continue;
      if (option.exclusive) { kept.splice(0, kept.length, id); break; }
      if (kept.length >= group.max) break;
      kept.push(id);
      if (option.slot) slots.add(option.slot);
    }
    if (kept.length) out[group.id] = kept;
  }
  return out;
}

/** Sorteia uma seleção completa válida para o tier (botão de dado). */
export function randomSelection(tier: CharacterTier, rng: () => number = Math.random): Selection {
  const out: Selection = {};
  for (const group of TRAIT_GROUPS) {
    const opts = optionsFor(group, tier);
    if (!opts.length) continue;
    const count = group.max === 1 ? 1 : 1 + Math.floor(rng() * group.max);
    const picked: TraitOption[] = [];
    const usedSlots = new Set<string>();
    const pool = [...opts].sort(() => rng() - 0.5);
    for (const opt of pool) {
      if (picked.length >= count) break;
      if (opt.slot && usedSlots.has(opt.slot)) continue;
      if (opt.exclusive) { if (!picked.length) picked.push(opt); break; }
      if (opt.slot) usedSlots.add(opt.slot);
      picked.push(opt);
    }
    out[group.id] = picked.map((p) => p.id);
  }
  return out;
}
