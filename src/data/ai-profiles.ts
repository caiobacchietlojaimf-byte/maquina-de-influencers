/* Influencers de IA reais que estão performando bem — referência de formato,
   frequência e estilo. Indicados pelo dono da máquina. */

export type AiProfile = {
  handle: string;
  platform: "instagram";
  name: string;
  bio: string;
  url: string;
};

const p = (handle: string, name: string, bio: string): AiProfile => ({
  handle,
  platform: "instagram",
  name,
  bio,
  url: `https://www.instagram.com/${handle}/`,
});

export const AI_PROFILES: readonly AiProfile[] = [
  p("moroniduarte", "Moroni Duarte", "Influencer de IA brasileiro em alta: lifestyle, humor e trends com identidade consistente."),
  p("moroniceee", "Moroni", "Perfil irmão do Moroni Duarte: mesma persona, outro ângulo de conteúdo. Bom exemplo de multiplicação de perfis."),
  p("red_cresty", "Red Cresty", "Personagem de IA com visual marcante: prova de que identidade forte segura audiência."),
  p("phil_john_jean", "Phil John Jean", "Persona de IA no formato lifestyle/reels curtos, com rosto consistente entre posts."),
  p("dahab.daddy", "Dahab Daddy", "Influencer de IA com estética premium: referência de direção de arte e ritmo de postagem."),
];
