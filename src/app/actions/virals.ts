"use server";

import { requireUser } from "@/lib/auth";
import { getViral, markViralsSeen, type Viral } from "@/lib/db";
import { listAiVirals, mineByUrl, mineTrending, refreshViralMedia } from "@/lib/miner";
import { isAiCharacterVideo, type DiscoveryCursors } from "@/lib/ai-discovery";
import { collectionOverdue, countNewVirals, getCollectorStatus, recordInstagramRound, runViralCollection, type CollectorStatus } from "@/lib/viral-collector";
import { runInstagramDiscovery } from "@/lib/instagram-discovery";
import { isAdmin } from "@/lib/admin";

export type MinedState = { virals: Viral[]; error?: string; notice?: string; cursors?: DiscoveryCursors; hasMore?: boolean; status?: CollectorStatus };

/** Estado da galeria sem coleta externa: o acervo vem do banco e o status do agendador.
 *  Rede de segurança: se o agendador estiver parado há mais de dois intervalos, uma
 *  rodada curta roda aqui (o lease impede que vários visitantes disparem ao mesmo tempo). */
export async function getMinedViralsAction(): Promise<MinedState> {
  await requireUser();
  let notice: string | undefined;
  let error: string | undefined;
  try {
    let status = await getCollectorStatus();
    if (collectionOverdue(status)) {
      const run = await runViralCollection({ budgetMs: 20_000 });
      if (!run.skipped) {
        status = await getCollectorStatus();
        if (run.errors.length) error = run.errors[0];
        else if (run.added) notice = `${run.added} novos vídeos encontrados.`;
      }
    }
    return { virals: await listAiVirals(), status, ...(notice ? { notice } : {}), ...(error ? { error } : {}) };
  } catch (caught) {
    return { virals: await listAiVirals(), error: caught instanceof Error ? caught.message : "Não foi possível consultar a coleta agora." };
  }
}

/** Verificação leve enquanto a página está aberta: só leitura do banco. */
export async function checkViralsNewsAction(since: number): Promise<{ newCount: number; status: CollectorStatus; now: number }> {
  await requireUser();
  const safeSince = Number.isFinite(since) && since > 0 ? since : Date.now();
  const [newCount, status] = await Promise.all([countNewVirals(safeSince), getCollectorStatus()]);
  return { newCount, status, now: Date.now() };
}

/** Registra a visita; o indicador "novo" da sessão atual usa o valor anterior. */
export async function markViralsSeenAction(): Promise<void> {
  const user = await requireUser();
  await markViralsSeen(user.id);
}

/** Leitura imediata dos perfis acompanhados no Instagram pela API oficial (ação explícita
 *  do administrador; não depende da trava do cron e não consulta serviço pago). */
export async function collectInstagramNowAction(): Promise<MinedState> {
  const user = await requireUser();
  if (!isAdmin(user)) return { virals: await listAiVirals(), error: "Só a conta administradora pode disparar a leitura do Instagram." };
  try {
    const now = Date.now();
    const round = await runInstagramDiscovery({ now });
    if (!round) return { virals: await listAiVirals(), status: await getCollectorStatus(), error: "Nenhuma conta administradora com Instagram conectado pela API oficial. Conecte em Publicar e tente de novo." };
    await recordInstagramRound(round, now);
    const ok = round.profiles.filter((profile) => profile.ok);
    const detail = ok.map((profile) => `@${profile.username} ${profile.videos} ${profile.videos === 1 ? "vídeo" : "vídeos"}`).join(", ");
    const notice = `Instagram (@${round.account}): ${round.added} ${round.added === 1 ? "vídeo novo" : "vídeos novos"} em ${ok.length} ${ok.length === 1 ? "perfil lido" : "perfis lidos"}${detail ? ` (${detail})` : ""}.`;
    return { virals: await listAiVirals(), status: await getCollectorStatus(), ...(round.errors.length ? { error: `${notice} Falhas: ${round.errors.join(" · ")}` } : { notice }) };
  } catch (caught) {
    return { virals: await listAiVirals(), error: caught instanceof Error ? caught.message : "Não foi possível ler o Instagram agora." };
  }
}

/** Força uma nova busca no TikTok (ação explícita do usuário). */
export async function refreshViralsAction(region = "AI", cursors?: DiscoveryCursors): Promise<MinedState> {
  await requireUser();
  try {
    const result = await mineTrending(region, { force: true, ...(cursors ? { cursors } : {}) });
    return { virals: await listAiVirals(), cursors: result.cursors, hasMore: result.hasMore, status: await getCollectorStatus(),
      notice: result.warning ?? (result.added ? `${result.added} novos vídeos de personagens de IA adicionados.` : "Busca concluída. Nenhum vídeo novo relacionado aos personagens nesta página.") };
  } catch (caught) {
    return {
      virals: await listAiVirals(),
      error: caught instanceof Error ? caught.message : "Mineração indisponível agora",
    };
  }
}

/** Importa um vídeo de IA de uma fonte social reconhecida. */
export async function importViralAction(url: string): Promise<MinedState> {
  await requireUser();
  try {
    const result = await mineByUrl(url);
    return { virals: await listAiVirals(), notice: result.added ? "Vídeo de IA importado." : "Vídeo já está no catálogo." };
  } catch (caught) {
    return {
      virals: await listAiVirals(),
      error: caught instanceof Error ? caught.message : "Import falhou",
    };
  }
}

/** Renew an expired media link from its saved, validated social URL. */
export async function refreshViralMediaAction(id: string): Promise<{ viral: Viral } | { error: string }> {
  await requireUser();
  const viral = await getViral(id);
  if (!viral || !isAiCharacterVideo(viral)) return { error: "Vídeo de IA não encontrado." };
  try { return { viral: await refreshViralMedia(viral) }; }
  catch (caught) { return { error: caught instanceof Error ? caught.message : "Não foi possível atualizar o vídeo." }; }
}

/** Compatibility guards: an old tab must not submit the former Kling recreation. */
export async function duplicateMinedViralAction(_input: { viralId: string; influencerId: string; extraPrompt?: string }): Promise<{ id: string } | { error: string }> {
  await requireUser();
  return { error: "Abra esta referência em Criar Vídeos e prepare a troca de personagem." };
}
export async function duplicateProfilePostAction(_input: { influencerId: string; handle: string; code: string; prompt: string; mode?: "scene" | "motion" }): Promise<{ id: string } | { error: string }> {
  await requireUser();
  return { error: "Abra esta referência em Criar Vídeos e prepare a troca de personagem." };
}
