/** Shared discovery rules: generic #viral, #fyp and #ai never qualify by themselves. */
export const AI_DISCOVERY_PROFILES = ["moroniduarte", "moroniceee", "red_cresty", "phil_john_jean", "dahab.daddy"] as const;
/** Related accounts observed in TikTok search; association is about the character, not account ownership. */
const PROFILE_ALIASES: Record<string, readonly string[]> = { moroniduarte: ["moroniduarte0", "moroniduarte77", "moroni duarte"] };
export const AI_DISCOVERY_QUERIES = [...AI_DISCOVERY_PROFILES, "moroniduarte0", "moroniduarte77", "personagem de IA influencer", "AI virtual influencer character", "AI generated character comedy"] as const;
export type DiscoveryCursors = Record<string, string>;
type Candidate = { title: string; authorHandle: string; authorName: string };

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function matchesAiProfile(item: Candidate, profile: string): boolean {
  const text = normalize(`${item.title} ${item.authorName}`);
  return [profile, ...(PROFILE_ALIASES[profile] ?? [])].some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = new RegExp(`(^|[^a-z0-9_])@?${escaped}($|[^a-z0-9_.])`, "i");
    return normalize(item.authorHandle.replace(/^@/, "")) === alias || boundary.test(text);
  });
}

export function isAiCharacterVideo(item: Candidate): boolean {
  const text = normalize(`${item.title} ${item.authorName} ${item.authorHandle}`);
  const tutorial = /tutorial|como\s+(?:criar|fazer|gerar)|how\s+to|curso|aprenda|passo\s+a\s+passo|prompt\s+guide/i;
  if (tutorial.test(text)) return false;
  if (AI_DISCOVERY_PROFILES.some((profile) => matchesAiProfile(item, profile))) return true;
  const character = /(personage(?:m|ns)|influencer|avatar|character|digital\s+human|virtual\s+model)/i;
  const ai = /#(?:ai|ia)\b|\bai[ -]+(?:generated|character|influencer|avatar|model)|(?:personagem|influencer|avatar)\s+(?:(?:de|com|por)\s+)?ia\b|artificial\s+intelligence|inteligencia\s+artificial|ai(?:generated|character|influencer|avatar)|virtual\s+(?:influencer|character|model)|(?:personagem|influencer|avatar)virtual/i;
  return character.test(text) && ai.test(text);
}

export function isMotionReference(duration: number): boolean {
  return Number.isFinite(duration) && duration >= 3 && duration <= 30;
}

/** Exact host validation prevents arbitrary URLs being passed to the resolver. */
export function parseSocialVideoUrl(input: string): { source: "tiktok" | "instagram"; url: string; code?: string } | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(host)) {
      const isShort = ["vm.tiktok.com", "vt.tiktok.com"].includes(host) && /^\/[a-z0-9]+\/?$/i.test(url.pathname);
      const isVideo = /^\/@[a-z0-9_.]+\/video\/\d+\/?$/i.test(url.pathname) || /^\/t\/[a-z0-9]+\/?$/i.test(url.pathname);
      if (!isShort && !isVideo) return null;
      return { source: "tiktok", url: `${url.origin}${url.pathname}` };
    }
    if (["instagram.com", "www.instagram.com"].includes(host)) {
      const code = url.pathname.match(/^\/(?:reel|reels|p)\/([a-z0-9_-]+)\/?$/i)?.[1];
      if (code) return { source: "instagram", code, url: `https://www.instagram.com/reel/${code}/` };
    }
    return null;
  } catch { return null; }
}
