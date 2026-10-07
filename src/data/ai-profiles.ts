/* Influencers de IA reais em alta — vídeos curados dos perfis com métricas
   colhidas do Instagram (snapshot) e prompt de duplicação por vídeo.
   GERADO por gen-profiles.mjs; edite o gerador, não este arquivo à mão. */

export type ReelMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  /** epoch segundos do post original. */
  postedAt?: number;
  duration?: number;
};

export type ProfilePost = {
  code: string;
  scene: string;
  prompt: string;
  metrics?: ReelMetrics;
};

export type AiProfile = {
  handle: string;
  platform: "instagram";
  name: string;
  bio: string;
  url: string;
  avatar: string;
  followers: string;
  posts: ProfilePost[];
};

export const AI_PROFILES: readonly AiProfile[] = [
  {
    handle: "moroniduarte",
    platform: "instagram",
    name: "Morôni Duarte",
    bio: "Influencer de IA brasileiro em alta: lifestyle, humor e trends com identidade consistente.",
    url: "https://www.instagram.com/moroniduarte/",
    avatar: "/avatars/moroniduarte.jpg",
    followers: "263 mil",
    posts: [
      {
        code: "DeMRcfiItqs",
        scene: "Selfie vlog na arquibancada de um estádio lotado",
        prompt: "The character from the reference image stars in this reel: filming a selfie vlog in the stands of a packed football stadium, crowd roaring behind, celebrating and talking to camera. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { views: 13900, likes: 13811, comments: 163, postedAt: 1791373246 },
      },
      {
        code: "DeMP27Io9C5",
        scene: "Look de gala: terno e smoking em evento",
        prompt: "The character from the reference image stars in this reel: arriving at a glamorous night event in a tailored tuxedo, slow confident walk, paparazzi flashes, adjusting the lapels. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { views: 3677, likes: 3549, comments: 151, postedAt: 1791372401 },
      },
      {
        code: "DeEhzS8IkSP",
        scene: "Show à noite com fogo e multidão",
        prompt: "The character from the reference image stars in this reel: at a night festival with fireworks and flames behind, dancing in the crowd, cinematic concert lighting. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 5677, comments: 242, postedAt: 1791113368 },
      },
      {
        code: "DeBqAPKoz2g",
        scene: "Selfie com amigos no rolê",
        prompt: "The character from the reference image stars in this reel: shooting a casual selfie video with friends on a night out, laughing and vibing with the group. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 19578, comments: 129, postedAt: 1791017237 },
      },
      {
        code: "DeHzb94I2ZU",
        scene: "Casual com celular: react e papo reto",
        prompt: "The character from the reference image stars in this reel: in a casual shirt reacting to something on their phone, talking straight to camera with expressive gestures. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { views: 18700, likes: 18774, comments: 415, postedAt: 1791223339 },
      },
      {
        code: "DeCDdSeI4SB",
        scene: "Troca de outfit: reveal de figurino",
        prompt: "The character from the reference image stars in this reel: doing an outfit-reveal transition: snaps fingers and the look changes from casual to styled streetwear. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 12733, comments: 211, postedAt: 1791030341 },
      },
    ],
  },
  {
    handle: "moroniceee",
    platform: "instagram",
    name: "Nice Duarte",
    bio: "Perfil irmão do Moroni: mesma estratégia de persona, outro ângulo de conteúdo.",
    url: "https://www.instagram.com/moroniceee/",
    avatar: "/avatars/moroniceee.jpg",
    followers: "541",
    posts: [
      {
        code: "DeMZGZ6v1l4",
        scene: "Fit check: moletom e gola alta",
        prompt: "The character from the reference image stars in this reel: doing a street-style fit check in an oversized hoodie and turtleneck, slow spin, posing between looks. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 3, comments: 1, postedAt: 1791377265 },
      },
      {
        code: "DeLahYVPpNm",
        scene: "Selfie aconchegante de parka",
        prompt: "The character from the reference image stars in this reel: in a cozy parka filming a close selfie video, soft daylight, talking to camera with playful energy. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 910, comments: 75, postedAt: 1791344407 },
      },
      {
        code: "DeKs4zZJCUy",
        scene: "Golden hour no parque",
        prompt: "The character from the reference image stars in this reel: walking through a park at golden hour filming themselves, sun flares, wind in the hair, dreamy vibe. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 3, comments: 2, postedAt: 1791320525 },
      },
      {
        code: "DeJ4zh6PRh2",
        scene: "No carro de óculos escuros",
        prompt: "The character from the reference image stars in this reel: sitting in a car with sunglasses filming a selfie video, head bobbing to music, mirror-check moment. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 3, comments: 9, postedAt: 1791293184 },
      },
      {
        code: "DeK4ToYpvE9",
        scene: "Meme fit esportivo",
        prompt: "The character from the reference image stars in this reel: in sporty sweats acting out a relatable meme skit, exaggerated reactions, jump cuts. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 1095, comments: 89, postedAt: 1791326538 },
      },
      {
        code: "DeLXNtpPg4M",
        scene: "Selfie com gente querida",
        prompt: "The character from the reference image stars in this reel: filming a warm selfie video with friends, genuine laughs, close framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 65, comments: 7, postedAt: 1791342682 },
      },
    ],
  },
  {
    handle: "red_cresty",
    platform: "instagram",
    name: "Red Cresty",
    bio: "Personagem de IA de visual marcante: identidade forte que segura audiência.",
    url: "https://www.instagram.com/red_cresty/",
    avatar: "/avatars/red_cresty.jpg",
    followers: "3.279",
    posts: [
      {
        code: "DeKURUQsgK9",
        scene: "Kilt e barba: presença de personagem",
        prompt: "The character from the reference image stars in this reel: in a bold kilt outfit with striking styling, powerful poses, slow camera push-in, theatrical presence. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 2046, comments: 31, postedAt: 1791307600 },
      },
      {
        code: "DeHw_w_sB6e",
        scene: "Dança de figurino completo",
        prompt: "The character from the reference image stars in this reel: performing an energetic dance in full costume, sharp choreography, dramatic stage-like lighting. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 22925, comments: 126, postedAt: 1791222099 },
      },
    ],
  },
  {
    handle: "phil_john_jean",
    platform: "instagram",
    name: "Phil Jean",
    bio: "Persona de IA em reels curtos de lifestyle, com rosto consistente entre posts.",
    url: "https://www.instagram.com/phil_john_jean/",
    avatar: "/avatars/phil_john_jean.jpg",
    followers: "10,1 mil",
    posts: [
      {
        code: "DeMpgOwAEz2",
        scene: "No iate em alto mar",
        prompt: "The character from the reference image stars in this reel: on the deck of a yacht at sea, wind in the clothes, filming themselves living the luxury life. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 44, comments: 2, postedAt: 1791385888 },
      },
      {
        code: "DeE4qRIANXe",
        scene: "Figurino de espantalho com chapéu-coco",
        prompt: "The character from the reference image stars in this reel: dressed as a stylish scarecrow with a bowler hat in a surreal field, deadpan acting, cinematic framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 1297, comments: 26, postedAt: 1791125358 },
      },
      {
        code: "Dd7M365SS0X",
        scene: "Cowboy dândi: brogues e gravata de caubói",
        prompt: "The character from the reference image stars in this reel: in dandy-cowboy style with brogues and a bolo tie, slow walk toward camera, western-fashion attitude. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 5554, comments: 120, postedAt: 1790800440 },
      },
      {
        code: "DeLPe0XgUKm",
        scene: "Terno e chapéu-coco clássico",
        prompt: "The character from the reference image stars in this reel: in a sharp suit and bowler hat posing through a classic-gentleman reel, cane twirl, vintage grade. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 180, comments: 1, postedAt: 1791338651 },
      },
      {
        code: "DeLvkyKAPnR",
        scene: "Figurino experimental de alumínio",
        prompt: "The character from the reference image stars in this reel: wearing an experimental foil-like outfit, avant-garde fashion reel, strong poses, studio flashes. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 1393, comments: 14, postedAt: 1791355487 },
      },
      {
        code: "Dd93agdySBq",
        scene: "Selfie de boina: papo com a câmera",
        prompt: "The character from the reference image stars in this reel: in a beret filming a close selfie video, charismatic talking-head energy, city background. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 54821, comments: 696, postedAt: 1790889870 },
      },
    ],
  },
  {
    handle: "dahab.daddy",
    platform: "instagram",
    name: "Dahab Daddy",
    bio: "Influencer de IA com estética premium: direção de arte e ritmo de postagem de referência.",
    url: "https://www.instagram.com/dahab.daddy/",
    avatar: "/avatars/dahab-daddy.jpg",
    followers: "224 mil",
    posts: [
      {
        code: "Dd_qcXdgsdb",
        scene: "Dança com violino e pandeiros",
        prompt: "The character from the reference image stars in this reel: dancing joyfully surrounded by musicians with violins and tambourines, festive golden lighting. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 278957, comments: 26303, postedAt: 1790950148 },
      },
      {
        code: "Dd8iR7XAS9H",
        scene: "Rolê de conversível no deserto",
        prompt: "The character from the reference image stars in this reel: cruising in an open roadster through desert roads, scarf in the wind, luxury travel-reel energy. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 114341, comments: 2794, postedAt: 1790845184 },
      },
      {
        code: "DeMIriBgUlS",
        scene: "Performance com pandeiros",
        prompt: "The character from the reference image stars in this reel: performing with tambourine players around, rhythmic claps, rich colors, celebration vibe. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 120, comments: 4, postedAt: 1791368654 },
      },
      {
        code: "DeKr7kZgoBq",
        scene: "Figurino premium: direção de arte",
        prompt: "The character from the reference image stars in this reel: in a premium styled outfit shot like a fashion editorial reel, controlled camera moves, luxury set. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        metrics: { likes: 691, comments: 13, postedAt: 1791320007 },
      },
    ],
  },
];

export function getProfile(handle: string): AiProfile | undefined {
  return AI_PROFILES.find((p) => p.handle === handle);
}
