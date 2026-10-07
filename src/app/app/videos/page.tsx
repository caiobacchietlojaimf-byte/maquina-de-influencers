import { currentUser } from "@/lib/auth";
import { listVideos } from "@/lib/db";
import { VideosGallery } from "@/components/videos-gallery";

export const metadata = { title: "Vídeos" };
export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const user = (await currentUser())!;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Meus <span style={{ color: "var(--accent)" }}>Vídeos</span>
          </h1>
          <p className="sub">
            Tudo que a máquina gerou: movimentos Genjutsu e duplicações de tendências. As gerações
            em andamento atualizam sozinhas.
          </p>
        </div>
      </div>
      <VideosGallery initialVideos={listVideos(user.id)} />
    </div>
  );
}
