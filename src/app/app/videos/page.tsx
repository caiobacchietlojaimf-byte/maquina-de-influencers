import { requirePageUser } from "@/lib/auth";
import { listVideos } from "@/lib/db";
import { VideosGallery } from "@/components/videos-gallery";

export const metadata = { title: "Vídeos" };
export const dynamic = "force-dynamic";
export const maxDuration = 240;

export default async function VideosPage() {
  const user = await requirePageUser();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Meus <span style={{ color: "var(--accent)" }}>Vídeos</span>
          </h1>
          <p className="sub">
            Suas trocas de personagem e vídeos gerados. As gerações
            em andamento atualizam sozinhas.
          </p>
        </div>
      </div>
      <VideosGallery initialVideos={await listVideos(user.id)} />
    </div>
  );
}
