import Link from "next/link";
import { Plus } from "lucide-react";

import { requirePageUser, sessionUserId } from "@/lib/auth";
import { listInfluencers, listVideos } from "@/lib/db";
import { groupInfluencerVersions, influencerVersionLabel } from "@/lib/influencer-versions";
import { VideosGallery } from "@/components/videos-gallery";

export const metadata = { title: "Meus vídeos" };
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export default async function VideosPage() {
  // Só o dono vê seus vídeos e influencers: as consultas são por userId da sessão.
  const userId = (await sessionUserId()) ?? "";
  const [, videos, influencers] = await Promise.all([requirePageUser(), userId ? listVideos(userId) : [], userId ? listInfluencers(userId) : []]);
  const names = groupInfluencerVersions(influencers).flatMap((family) => family.versions.map((item) => ({
    id: item.id,
    name: family.versions.length > 1 ? `${family.root.name} · ${influencerVersionLabel(item)}` : family.root.name,
  })));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meus <span style={{ color: "var(--accent-text)" }}>vídeos</span></h1>
          <p className="sub">Assista, revise e prepare seus vídeos para publicar.</p>
        </div>
        <Link href="/app/criar-videos" className="btn btn-accent"><Plus size={16} aria-hidden="true" /> Criar vídeo</Link>
      </div>
      <VideosGallery initialVideos={videos} influencers={names} />
    </div>
  );
}
