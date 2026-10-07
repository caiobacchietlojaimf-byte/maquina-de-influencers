import { requirePageUser } from "@/lib/auth";
import { listPosts, listSocialAccounts, listVideos } from "@/lib/db";
import { tiktokOAuthConfigured } from "@/lib/social";
import { PublishCenter } from "@/components/publish-center";

export const metadata = { title: "Publicar" };
export const dynamic = "force-dynamic";

export default async function PublicarPage({
  searchParams,
}: {
  searchParams: Promise<{ video?: string; conectado?: string; erro?: string }>;
}) {
  const user = await requirePageUser();
  const { video, conectado, erro } = await searchParams;

  const [videosAll, accounts, posts] = await Promise.all([
    listVideos(user.id),
    listSocialAccounts(user.id),
    listPosts(user.id),
  ]);
  const completed = videosAll.filter((v) => v.status === "completed" && v.resultUrl);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Publicar <span style={{ color: "var(--accent)" }}>& Agendar</span>
          </h1>
          <p className="sub">
            O último passo da máquina: conecte suas contas, escolha um vídeo gerado, escreva a
            legenda e publique agora ou agende. A fila roda sozinha no servidor.
          </p>
        </div>
      </div>
      <PublishCenter
        initialAccounts={accounts.map((a) => ({
          platform: a.platform,
          status: a.status,
          username: a.username,
          connectedAt: a.connectedAt,
        }))}
        initialPosts={posts}
        videos={completed.map((v) => ({
          id: v.id,
          name: v.presetName ?? "Vídeo",
          resultUrl: v.resultUrl!,
          thumbnailUrl: v.thumbnailUrl,
          kind: v.kind,
        }))}
        tiktokOAuth={tiktokOAuthConfigured()}
        preselectVideoId={video ?? null}
        flash={conectado ? `Conta do ${conectado} conectada!` : erro ? "A conexão OAuth falhou — tente de novo." : null}
      />
    </div>
  );
}
