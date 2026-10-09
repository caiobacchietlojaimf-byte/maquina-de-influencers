import type { Influencer } from "./db";

export function influencerRootId(influencer: Influencer): string {
  return influencer.rootInfluencerId || influencer.id;
}

export function influencerVersionLabel(influencer: Influencer): string {
  return influencer.variantLabel || (influencer.rootInfluencerId ? "Nova versão" : "Original");
}

export type InfluencerFamily = { id: string; root: Influencer; versions: Influencer[] };

/** Legacy influencers are original versions; an orphan is kept accessible. */
export function groupInfluencerVersions(influencers: Influencer[]): InfluencerFamily[] {
  const groups = new Map<string, Influencer[]>();
  for (const influencer of influencers) {
    if (influencer.deletedAt) continue;
    const key = `${influencer.userId}:${influencerRootId(influencer)}`;
    const versions = groups.get(key) ?? [];
    versions.push(influencer);
    groups.set(key, versions);
  }
  return Array.from(groups.values(), versions => {
    const id = influencerRootId(versions[0]);
    versions.sort((a, b) => Number(b.id === id) - Number(a.id === id) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
    const root = versions.find(version => version.id === id) ?? versions[0];
    return { id, root, versions };
  }).sort((a, b) => b.root.createdAt - a.root.createdAt || a.id.localeCompare(b.id));
}
