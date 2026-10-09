import { requirePageUser } from "@/lib/auth";
import {
  listInfluencers,
  listPosts,
  listSocialAccounts,
  listVideos,
} from "@/lib/db";
import { tiktokOAuthConfigured, instagramOAuthConfigured } from "@/lib/social";
import { PublishCenter } from "@/components/publish-center";

export const metadata = { title: "Publicar" };
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export default async function PublicarPage({
  searchParams,
}: {
  searchParams: Promise<{ video?: string; conectado?: string; erro?: string }>;
}) {
  const user = await requirePageUser();
  const { video, conectado, erro } = await searchParams;

  const [videosAll, accounts, posts, influencers] = await Promise.all([
    listVideos(user.id),
    listSocialAccounts(user.id),
    listPosts(user.id),
    listInfluencers(user.id),
  ]);
  const completed = videosAll.filter(
    (v) => v.status === "completed" && !v.deletedAt && v.resultUrl,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>
            Publicar <span style={{ color: "var(--accent-text)" }}>& Agendar</span>
          </h1>
          <p className="sub">
            Escolha o vídeo e receba a legenda pronta. Revise, publique ou
            agende e acompanhe o desempenho do seu Instagram.
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
          thumbnailUrl: v.thumbnailSourceUrl === v.resultUrl ? v.thumbnailUrl : undefined,
          kind: v.kind,
          characterName: influencers.find(
            (influencer) => influencer.id === v.influencerId,
          )?.name,
        }))}
        tiktokOAuth={tiktokOAuthConfigured()}
        instagramOAuth={instagramOAuthConfigured()}
        backgroundPublishing={
          !process.env.VERCEL ||
          process.env.PUBLICATION_CRON_CONFIGURED === "true"
        }
        preselectVideoId={video ?? null}
        flash={
          conectado
            ? `Conta do ${conectado} conectada!`
            : erro
              ? "A conexão OAuth falhou — tente de novo."
              : null
        }
      />
    </div>
  );
}
