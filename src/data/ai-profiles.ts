/* Influencers de IA reais que estão performando — com os vídeos deles curados
   e um prompt de duplicação pronto por vídeo. Os reels são exibidos pelo
   embed oficial do Instagram; a duplicação gera com o SEU influencer como
   protagonista da mesma cena. */

export type ProfilePost = {
  /** Código do reel no Instagram (permalink = instagram.com/reel/<code>/). */
  code: string;
  /** Descrição curta da cena, em PT, para o card. */
  scene: string;
  /** Prompt de duplicação (EN) — editável antes de gerar. */
  prompt: string;
};

export type AiProfile = {
  handle: string;
  platform: "instagram";
  name: string;
  bio: string;
  url: string;
  posts: ProfilePost[];
};

const BASE =
  "Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.";

const post = (code: string, scene: string, promptScene: string): ProfilePost => ({
  code,
  scene,
  prompt: `The character from the reference image stars in this reel: ${promptScene} ${BASE}`,
});

export const AI_PROFILES: readonly AiProfile[] = [
  {
    handle: "moroniduarte",
    platform: "instagram",
    name: "Morôni Duarte",
    bio: "Influencer de IA brasileiro em alta: lifestyle, humor e trends com identidade consistente.",
    url: "https://www.instagram.com/moroniduarte/",
    posts: [
      post("DeMRcfiItqs", "Selfie vlog na arquibancada de um estádio lotado", "filming a selfie vlog in the stands of a packed football stadium, crowd roaring behind, celebrating and talking to camera."),
      post("DeMP27Io9C5", "Look de gala: terno e smoking em evento", "arriving at a glamorous night event in a tailored tuxedo, slow confident walk, paparazzi flashes, adjusting the lapels."),
      post("DeEhzS8IkSP", "Show à noite com fogo e multidão", "at a night festival with fireworks and flames behind, dancing in the crowd, cinematic concert lighting."),
      post("DeBqAPKoz2g", "Selfie com amigos no rolê", "shooting a casual selfie video with friends on a night out, laughing and vibing with the group."),
      post("DeHzb94I2ZU", "Casual com celular: react e papo reto", "in a casual shirt reacting to something on their phone, talking straight to camera with expressive gestures."),
      post("DeCDdSeI4SB", "Troca de outfit: reveal de figurino", "doing an outfit-reveal transition: snaps fingers and the look changes from casual to styled streetwear."),
    ],
  },
  {
    handle: "moroniceee",
    platform: "instagram",
    name: "Nice Duarte",
    bio: "Perfil irmão do Moroni: mesma estratégia de persona, outro ângulo de conteúdo.",
    url: "https://www.instagram.com/moroniceee/",
    posts: [
      post("DeMZGZ6v1l4", "Fit check: moletom e gola alta", "doing a street-style fit check in an oversized hoodie and turtleneck, slow spin, posing between looks."),
      post("DeLahYVPpNm", "Selfie aconchegante de parka", "in a cozy parka filming a close selfie video, soft daylight, talking to camera with playful energy."),
      post("DeKs4zZJCUy", "Golden hour no parque", "walking through a park at golden hour filming themselves, sun flares, wind in the hair, dreamy vibe."),
      post("DeJ4zh6PRh2", "No carro de óculos escuros", "sitting in a car with sunglasses filming a selfie video, head bobbing to music, mirror-check moment."),
      post("DeK4ToYpvE9", "Meme fit esportivo", "in sporty sweats acting out a relatable meme skit, exaggerated reactions, jump cuts."),
      post("DeLXNtpPg4M", "Selfie com gente querida", "filming a warm selfie video with friends, genuine laughs, close framing."),
    ],
  },
  {
    handle: "red_cresty",
    platform: "instagram",
    name: "Red Cresty",
    bio: "Personagem de IA de visual marcante: identidade forte que segura audiência.",
    url: "https://www.instagram.com/red_cresty/",
    posts: [
      post("DeKURUQsgK9", "Kilt e barba: presença de personagem", "in a bold kilt outfit with striking styling, powerful poses, slow camera push-in, theatrical presence."),
      post("DeHw_w_sB6e", "Dança de figurino completo", "performing an energetic dance in full costume, sharp choreography, dramatic stage-like lighting."),
    ],
  },
  {
    handle: "phil_john_jean",
    platform: "instagram",
    name: "Phil Jean",
    bio: "Persona de IA em reels curtos de lifestyle, com rosto consistente entre posts.",
    url: "https://www.instagram.com/phil_john_jean/",
    posts: [
      post("DeMpgOwAEz2", "No iate em alto mar", "on the deck of a yacht at sea, wind in the clothes, filming themselves living the luxury life."),
      post("DeE4qRIANXe", "Figurino de espantalho com chapéu-coco", "dressed as a stylish scarecrow with a bowler hat in a surreal field, deadpan acting, cinematic framing."),
      post("Dd7M365SS0X", "Cowboy dândi: brogues e gravata de caubói", "in dandy-cowboy style with brogues and a bolo tie, slow walk toward camera, western-fashion attitude."),
      post("DeLPe0XgUKm", "Terno e chapéu-coco clássico", "in a sharp suit and bowler hat posing through a classic-gentleman reel, cane twirl, vintage grade."),
      post("DeLvkyKAPnR", "Figurino experimental de alumínio", "wearing an experimental foil-like outfit, avant-garde fashion reel, strong poses, studio flashes."),
      post("Dd93agdySBq", "Selfie de boina: papo com a câmera", "in a beret filming a close selfie video, charismatic talking-head energy, city background."),
    ],
  },
  {
    handle: "dahab.daddy",
    platform: "instagram",
    name: "Dahab Daddy",
    bio: "Influencer de IA com estética premium: direção de arte e ritmo de postagem de referência.",
    url: "https://www.instagram.com/dahab.daddy/",
    posts: [
      post("Dd_qcXdgsdb", "Dança com violino e pandeiros", "dancing joyfully surrounded by musicians with violins and tambourines, festive golden lighting."),
      post("Dd8iR7XAS9H", "Rolê de conversível no deserto", "cruising in an open roadster through desert roads, scarf in the wind, luxury travel-reel energy."),
      post("DeMIriBgUlS", "Performance com pandeiros", "performing with tambourine players around, rhythmic claps, rich colors, celebration vibe."),
      post("DeKr7kZgoBq", "Figurino premium: direção de arte", "in a premium styled outfit shot like a fashion editorial reel, controlled camera moves, luxury set."),
    ],
  },
];

export function getProfile(handle: string): AiProfile | undefined {
  return AI_PROFILES.find((p) => p.handle === handle);
}
