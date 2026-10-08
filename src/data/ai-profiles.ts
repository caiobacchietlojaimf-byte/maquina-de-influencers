/* Influencers de IA reais em alta — top reels por views com métricas
   colhidas do Instagram (snapshot) e prompt de duplicação por vídeo.
   Catálogo inicial gerado por gen-profiles.mjs, complementado por snapshots
   verificados. Proveniência: docs/viral-catalog-provenance.md. */

export type ReelMetrics = {
  views?: number;
  likes?: number;
  comments?: number;
  /** epoch segundos do post original. */
  postedAt?: number;
  duration?: number;
  /** Data ISO (AAAA-MM-DD) de observação das métricas; não é data de publicação. */
  observedAt?: string;
};

export type ProfilePost = {
  code: string;
  scene: string;
  prompt: string;
  /** Proporção usada no card; referências sem mídia usam o padrão 9:16. */
  ar: number;
  /** false = reprodução embutida indisponível ou não verificada (abrir no IG). */
  embeddable: boolean;
  /** Capa disponível; um avatar pode representar referências sem capa verificada. */
  thumbnail?: string;
  /** Caminho do mp4 hospedado no sistema; ausência não garante disponibilidade de embed. */
  video?: string;
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
    followers: "308 mil",
    posts: [
      {
        code: "DeBwwYiIO-F",
        scene: "Trend em alta do perfil: performance completa",
        prompt: "The character from the reference image stars in this reel: performing this trending reel scene with sharp timing and charisma, same framing and energy as the original. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: false,
        metrics: { views: 7400000, likes: 245000, comments: 3240, postedAt: 1791061358, duration: 21.755645, observedAt: "2026-10-08" },
      },
      {
        code: "DeHKjppIP1s",
        scene: "Cena viral com gente ao redor",
        prompt: "The character from the reference image stars in this reel: starring in this viral group scene, natural interactions around, confident close framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5624,
        embeddable: true,
        video: "/reel-videos/DeHKjppIP1s.mp4",
        metrics: { likes: 182691, comments: 2535, postedAt: 1791201871 },
      },
      {
        code: "DeEhBi9I2J6",
        scene: "Momento viral noturno",
        prompt: "The character from the reference image stars in this reel: in a lively night scene filming themselves, city lights and movement around, viral-reel energy. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5624,
        embeddable: true,
        video: "/reel-videos/DeEhBi9I2J6.mp4",
        metrics: { likes: 60053, comments: 692, postedAt: 1791112952 },
      },
      {
        code: "DeEhbmKImr8",
        scene: "Sequência viral do rolê",
        prompt: "The character from the reference image stars in this reel: in a fun night-out sequence, quick cuts and real reactions, handheld energy. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: false,
        metrics: { likes: 52979, comments: 597, postedAt: 1791250524 },
      },
      {
        code: "DeBsCZbIQ2k",
        scene: "Trend de humor do perfil",
        prompt: "The character from the reference image stars in this reel: acting out this comedic trending bit with exaggerated expressions and punchy timing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5634,
        embeddable: true,
        video: "/reel-videos/DeBsCZbIQ2k.mp4",
        metrics: { views: 2700000, likes: 47300, comments: 1075, postedAt: 1791018055, observedAt: "2026-10-08" },
      },
      {
        code: "DeH2G83ISgh",
        scene: "Cena viral do dia a dia",
        prompt: "The character from the reference image stars in this reel: in a relatable day-in-the-life viral moment, casual styling, close engaging framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5624,
        embeddable: true,
        video: "/reel-videos/DeH2G83ISgh.mp4",
        metrics: { likes: 41704, comments: 308, postedAt: 1791224674 },
      },
      {
        code: "DeBt7SjIQzG",
        scene: "Reel de humor em alta",
        prompt: "The character from the reference image stars in this reel: acting this trending comedy reel with expressive timing and close framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5624,
        embeddable: true,
        video: "/reel-videos/DeBt7SjIQzG.mp4",
        metrics: { likes: 39887, comments: 438, postedAt: 1791019092 },
      },
      {
        code: "Dd_iAosITdb",
        scene: "Trend viral do perfil",
        prompt: "The character from the reference image stars in this reel: performing this viral trend with the same pacing and attitude as the original. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd_iAosITdb.mp4",
        metrics: { likes: 38015, comments: 566, postedAt: 1790945748 },
      },
      {
        code: "DeEgs-dIaFQ",
        scene: "Reel de @moroniduarte · DeEgs-dIaFQ",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 3200000, likes: 30600, comments: 288, observedAt: "2026-10-08" },
      },
      {
        code: "DeND-2PoU4h",
        scene: "Reel de @moroniduarte · DeND-2PoU4h",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 321000, likes: 2136, comments: 70, observedAt: "2026-10-08" },
      },
      {
        code: "DeNDTR9o5dM",
        scene: "Reel de @moroniduarte · DeNDTR9o5dM",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 282000, likes: 2509, comments: 82, observedAt: "2026-10-08" },
      },
      {
        code: "DeNCmftIZa6",
        scene: "Reel de @moroniduarte · DeNCmftIZa6",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 189000, likes: 1276, comments: 55, observedAt: "2026-10-08" },
      },
      {
        code: "DeNCGJDo1nz",
        scene: "Reel de @moroniduarte · DeNCGJDo1nz",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 397000, likes: 3989, comments: 101, observedAt: "2026-10-08" },
      },
      {
        code: "DeNB-sNIgH5",
        scene: "Reel de @moroniduarte · DeNB-sNIgH5",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 251000, likes: 2578, comments: 59, observedAt: "2026-10-08" },
      },
      {
        code: "DeNBw4UILFL",
        scene: "Reel de @moroniduarte · DeNBw4UILFL",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 803000, likes: 33400, comments: 1060, observedAt: "2026-10-08" },
      },
      {
        code: "DeNAOuUI4-n",
        scene: "Reel de @moroniduarte · DeNAOuUI4-n",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 144000, likes: 1436, comments: 38, observedAt: "2026-10-08" },
      },
      {
        code: "DeNBCdSI1fb",
        scene: "Reel de @moroniduarte · DeNBCdSI1fb",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 275000, likes: 4204, comments: 113, observedAt: "2026-10-08" },
      },
      {
        code: "DeNA4h2o_3a",
        scene: "Reel de @moroniduarte · DeNA4h2o_3a",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 524000, likes: 13700, comments: 176, observedAt: "2026-10-08" },
      },
      {
        code: "DeNA2VkoKye",
        scene: "Reel de @moroniduarte · DeNA2VkoKye",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 199000, likes: 4637, comments: 106, observedAt: "2026-10-08" },
      },
      {
        code: "DeNAU0rIgcH",
        scene: "Reel de @moroniduarte · DeNAU0rIgcH",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 190000, likes: 2785, comments: 90, observedAt: "2026-10-08" },
      },
      {
        code: "DeNADsLocf7",
        scene: "Reel de @moroniduarte · DeNADsLocf7",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 2300000, likes: 67900, comments: 652, observedAt: "2026-10-08" },
      },
      {
        code: "DeM_8SBomYF",
        scene: "Reel de @moroniduarte · DeM_8SBomYF",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 93500, likes: 534, comments: 17, observedAt: "2026-10-08" },
      },
      {
        code: "DeM_3h3ow7X",
        scene: "Reel de @moroniduarte · DeM_3h3ow7X",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 97500, likes: 756, comments: 19, observedAt: "2026-10-08" },
      },
      {
        code: "DeM_t9hoBda",
        scene: "Reel de @moroniduarte · DeM_t9hoBda",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 95100, likes: 1084, comments: 36, observedAt: "2026-10-08" },
      },
      {
        code: "DeM_q8qIRrG",
        scene: "Reel de @moroniduarte · DeM_q8qIRrG",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 91800, likes: 790, comments: 24, observedAt: "2026-10-08" },
      },
      {
        code: "DeM_l1EIJlq",
        scene: "Reel de @moroniduarte · DeM_l1EIJlq",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 145000, likes: 4743, comments: 83, observedAt: "2026-10-08" },
      },
      {
        code: "DeM_hWDIVbE",
        scene: "Reel de @moroniduarte · DeM_hWDIVbE",
        prompt: "Create an original vertical 9:16 short video starring the character from the reference image. Preserve the character identity and outfit, with natural lighting, expressive movement and a clear visual hook. Use an original setting and sequence with engaging pacing.",
        ar: 0.5625,
        embeddable: false,
        thumbnail: "/avatars/moroniduarte.jpg",
        metrics: { views: 110000, likes: 3105, comments: 56, observedAt: "2026-10-08" },
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
        code: "DeKN_fYpH0w",
        scene: "Reel em alta do perfil",
        prompt: "The character from the reference image stars in this reel: starring in this trending reel with the same vibe and pacing as the original. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: false,
        metrics: { likes: 1557, comments: 49, postedAt: 1791304351 },
      },
      {
        code: "DeJAqOXPm6y",
        scene: "Momento viral do perfil",
        prompt: "The character from the reference image stars in this reel: recreating this viral moment with natural charisma and close framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeJAqOXPm6y.mp4",
        metrics: { likes: 1400, comments: 47, postedAt: 1791263748 },
      },
      {
        code: "DeK4ToYpvE9",
        scene: "Meme fit esportivo",
        prompt: "The character from the reference image stars in this reel: in sporty sweats acting out a relatable meme skit, exaggerated reactions, jump cuts. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeK4ToYpvE9.mp4",
        metrics: { likes: 1116, comments: 89, postedAt: 1791326538 },
      },
      {
        code: "DeLahYVPpNm",
        scene: "Selfie aconchegante de parka",
        prompt: "The character from the reference image stars in this reel: in a cozy parka filming a close selfie video, soft daylight, talking to camera with playful energy. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeLahYVPpNm.mp4",
        metrics: { likes: 989, comments: 75, postedAt: 1791344407 },
      },
      {
        code: "DeLXNtpPg4M",
        scene: "Selfie com gente querida",
        prompt: "The character from the reference image stars in this reel: filming a warm selfie video with friends, genuine laughs, close framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeLXNtpPg4M.mp4",
        metrics: { likes: 667, comments: 7, postedAt: 1791342682 },
      },
      {
        code: "DeMZGZ6v1l4",
        scene: "Fit check: moletom e gola alta",
        prompt: "The character from the reference image stars in this reel: doing a street-style fit check in an oversized hoodie and turtleneck, slow spin, posing between looks. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeMZGZ6v1l4.mp4",
        metrics: { likes: 3, comments: 1, postedAt: 1791377265 },
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
        code: "DeHw_w_sB6e",
        scene: "Dança de figurino completo",
        prompt: "The character from the reference image stars in this reel: performing an energetic dance in full costume, sharp choreography, dramatic stage-like lighting. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeHw_w_sB6e.mp4",
        metrics: { likes: 23200, comments: 126, postedAt: 1791222099 },
      },
      {
        code: "DeKURUQsgK9",
        scene: "Kilt e barba: presença de personagem",
        prompt: "The character from the reference image stars in this reel: in a bold kilt outfit with striking styling, powerful poses, slow camera push-in, theatrical presence. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeKURUQsgK9.mp4",
        metrics: { likes: 2174, comments: 31, postedAt: 1791307600 },
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
        code: "Dd93agdySBq",
        scene: "Selfie de boina: papo com a câmera",
        prompt: "The character from the reference image stars in this reel: in a beret filming a close selfie video, charismatic talking-head energy, city background. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd93agdySBq.mp4",
        metrics: { likes: 55300, comments: 696, postedAt: 1790889870 },
      },
      {
        code: "DeF8cKxgGd6",
        scene: "Reel viral do personagem",
        prompt: "The character from the reference image stars in this reel: starring in this trending character reel, same framing, pacing and attitude as the original. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeF8cKxgGd6.mp4",
        metrics: { likes: 7829, comments: 181, postedAt: 1791161010 },
      },
      {
        code: "DeJBOWGAUmV",
        scene: "Cena em alta do perfil",
        prompt: "The character from the reference image stars in this reel: recreating this popular reel scene with confident presence and clean cinematography. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeJBOWGAUmV.mp4",
        metrics: { likes: 6974, comments: 53, postedAt: 1791264051 },
      },
      {
        code: "Dd7M365SS0X",
        scene: "Cowboy dândi: brogues e gravata de caubói",
        prompt: "The character from the reference image stars in this reel: in dandy-cowboy style with brogues and a bolo tie, slow walk toward camera, western-fashion attitude. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd7M365SS0X.mp4",
        metrics: { likes: 5557, comments: 120, postedAt: 1790800440 },
      },
      {
        code: "DeLvkyKAPnR",
        scene: "Figurino experimental de alumínio",
        prompt: "The character from the reference image stars in this reel: wearing an experimental foil-like outfit, avant-garde fashion reel, strong poses, studio flashes. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DeLvkyKAPnR.mp4",
        metrics: { likes: 4057, comments: 14, postedAt: 1791355487 },
      },
      {
        code: "Dd9Junogz7L",
        scene: "Momento viral do personagem",
        prompt: "The character from the reference image stars in this reel: acting this viral character moment with expressive timing and close framing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd9Junogz7L.mp4",
        metrics: { likes: 3995, comments: 87, postedAt: 1790865896 },
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
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd_qcXdgsdb.mp4",
        metrics: { likes: 279000, comments: 26303, postedAt: 1790950148 },
      },
      {
        code: "DdzgbbAR4VM",
        scene: "Hit do perfil: cena de luxo",
        prompt: "The character from the reference image stars in this reel: starring in this hit luxury-lifestyle reel, rich styling, controlled camera moves. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/DdzgbbAR4VM.mp4",
        metrics: { likes: 189620, comments: 8987, postedAt: 1790542213 },
      },
      {
        code: "Dd6TVXUgWqh",
        scene: "Reel viral premium",
        prompt: "The character from the reference image stars in this reel: recreating this high-performing premium reel with elegant styling and confident pacing. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: false,
        metrics: { likes: 135918, comments: 4524, postedAt: 1790770234 },
      },
      {
        code: "Dd8iR7XAS9H",
        scene: "Rolê de conversível no deserto",
        prompt: "The character from the reference image stars in this reel: cruising in an open roadster through desert roads, scarf in the wind, luxury travel-reel energy. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd8iR7XAS9H.mp4",
        metrics: { likes: 114341, comments: 2794, postedAt: 1790845184 },
      },
      {
        code: "Dd6EKbigwTw",
        scene: "Cena viral de celebração",
        prompt: "The character from the reference image stars in this reel: in a festive viral celebration scene, warm lights, rhythm and joy all around. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd6EKbigwTw.mp4",
        metrics: { likes: 106086, comments: 3779, postedAt: 1790762269 },
      },
      {
        code: "Dd9wTCTRwtx",
        scene: "Momento em alta do perfil",
        prompt: "The character from the reference image stars in this reel: starring in this trending scene with premium art direction and smooth camera moves. Vertical 9:16 Instagram reel, handheld smartphone look, natural motion and lighting, confident influencer energy, trending-reel pacing, hyper-realistic.",
        ar: 0.5625,
        embeddable: true,
        video: "/reel-videos/Dd9wTCTRwtx.mp4",
        metrics: { likes: 63436, comments: 2690, postedAt: 1790886086 },
      },
    ],
  },
];

export function getProfile(handle: string): AiProfile | undefined {
  return AI_PROFILES.find((p) => p.handle === handle);
}
