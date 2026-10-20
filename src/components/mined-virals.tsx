"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Info, Link2, RefreshCw, Search, Sparkles } from "lucide-react";

import {
  checkViralsNewsAction,
  getMinedViralsAction,
  importViralAction,
  markViralsSeenAction,
  refreshViralsAction,
  type MinedState,
} from "@/app/actions/virals";
import { AI_DISCOVERY_PROFILES, isAiCharacterVideo, matchesAiProfile, type DiscoveryCursors } from "@/lib/ai-discovery";
import { AI_PROFILES } from "@/data/ai-profiles";
import { displayDateTime } from "@/lib/display-date";
import type { Viral } from "@/lib/db";
import { discoveredTrends } from "@/lib/effects-catalog";
import { PLATFORM_LABEL, relativeTime, type ExplorePlatform } from "@/lib/explore-format";
import { buildCharacterSections, viralItem, type ExploreItem } from "@/lib/explore-items";
import type { CollectorStatus, SourceState } from "@/lib/viral-collector";
import { ExploreCard, ExploreDialog, PlatformMark } from "./explore-card";
import { CharactersTab } from "./explore-characters";
import { EffectsTab } from "./explore-effects";
import styles from "./explore-virals.module.css";

/* Explorar virais: três áreas sobre um único acervo.
   - Vídeos: tudo o que a coleta encontrou + catálogo verificado.
   - Descobrir personagens IA: o mesmo acervo agrupado por perfil/autor.
   - Efeitos: presets executáveis + tendências descobertas (do mesmo acervo).
   Nenhuma aba consulta fontes externas; o servidor coleta sozinho (cron) e a
   página só lê o banco e verifica novidades de leve enquanto está aberta. */

type MiniInfluencer = { id: string; name: string; imageUrl: string };
type Tab = "videos" | "characters" | "effects";
type Platform = "all" | ExplorePlatform;
type Order = "discovered" | "published" | "views" | "likes";

const PAGE_SIZE = 24;
const NEWS_POLL_MS = 60_000;

const PROFILE_CHIPS = (() => {
  const seen = new Set<string>();
  const list: { handle: string; name: string; avatar?: string }[] = [];
  for (const profile of AI_PROFILES) {
    if (seen.has(profile.handle)) continue;
    seen.add(profile.handle);
    list.push({ handle: profile.handle, name: profile.name, avatar: profile.avatar });
  }
  for (const handle of AI_DISCOVERY_PROFILES) if (!seen.has(handle)) list.push({ handle, name: `@${handle}` });
  return list;
})();

function discoveredAt(viral: Viral): number {
  return viral.discoveredAt ?? viral.minedAt;
}

export function MinedVirals({ initialVirals, initialStatus, seenAt, now: serverNow, influencers }: {
  initialVirals: Viral[];
  initialStatus: CollectorStatus | null;
  seenAt: number | null;
  now: number;
  influencers: MiniInfluencer[];
}) {
  const router = useRouter();
  const baseId = useId();
  const [tab, setTab] = useState<Tab>("videos");
  const [platform, setPlatform] = useState<Platform>("all");
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<Order>("discovered");
  const [onlyNew, setOnlyNew] = useState(false);
  const [profileFilter, setProfileFilter] = useState("");
  const [virals, setVirals] = useState<Viral[]>(() => initialVirals.filter(isAiCharacterVideo));
  const [status, setStatus] = useState<CollectorStatus | null>(initialStatus);
  const [cursors, setCursors] = useState<DiscoveryCursors>({});
  const [hasMore, setHasMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [active, setActive] = useState<ExploreItem | null>(null);
  const [now, setNow] = useState(serverNow);
  const [mining, startMining] = useTransition();
  const mounted = useRef(true);

  const latestKnown = useMemo(() => Math.max(0, ...virals.map(discoveredAt)), [virals]);
  const newCount = useMemo(() => (seenAt ? virals.filter((viral) => discoveredAt(viral) > seenAt && !viral.unavailableAt).length : 0), [virals, seenAt]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const applyResult = useCallback((result: MinedState) => {
    if (!mounted.current) return;
    setVirals(result.virals.filter(isAiCharacterVideo));
    setNotice(result.notice ?? null);
    setError(result.error ?? null);
    if (result.status) setStatus(result.status);
    if (result.cursors) setCursors(result.cursors);
    if (typeof result.hasMore === "boolean") setHasMore(result.hasMore);
    setPendingNew(0);
    setNow(Date.now());
  }, []);

  // Ao abrir: estado do acervo e do agendador (só banco) e registro da visita.
  useEffect(() => {
    startMining(async () => {
      try { applyResult(await getMinedViralsAction()); }
      catch { if (mounted.current) setError("Não foi possível consultar a coleta agora. O acervo salvo continua disponível."); }
    });
    void markViralsSeenAction().catch(() => undefined);
  }, [applyResult, startMining]);

  // Verificação leve de novidades enquanto a aba está visível (sem coleta externa).
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let inFlight = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const result = await checkViralsNewsAction(latestKnown);
        if (!mounted.current) return;
        setStatus(result.status);
        setNow(result.now);
        setPendingNew(result.newCount);
      } catch { /* a próxima verificação tenta de novo */ }
      finally { inFlight = false; }
    };
    const start = () => { if (!timer) timer = setInterval(() => { void tick(); }, NEWS_POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined; } };
    const visibility = () => { if (document.visibilityState === "visible") { start(); void tick(); } else stop(); };
    document.addEventListener("visibilitychange", visibility);
    start();
    return () => { stop(); document.removeEventListener("visibilitychange", visibility); };
  }, [latestKnown]);

  const reload = () => {
    startMining(async () => {
      try { applyResult(await getMinedViralsAction()); }
      catch { if (mounted.current) setError("Não foi possível atualizar a galeria agora."); }
    });
  };

  const searchMore = (more = false) => {
    startMining(async () => {
      try { applyResult(await refreshViralsAction("AI", more ? cursors : undefined)); }
      catch { if (mounted.current) setError("Não foi possível buscar novos vídeos agora."); }
    });
  };

  const importByUrl = () => {
    if (!importUrl.trim()) return;
    startMining(async () => {
      try {
        const result = await importViralAction(importUrl);
        applyResult(result);
        if (!result.error) { setImportUrl(""); setImportOpen(false); setProfileFilter(""); setSearch(""); setPlatform("all"); setTab("videos"); }
      } catch { if (mounted.current) setError("Não foi possível importar esse vídeo agora."); }
    });
  };

  // Itens das três áreas derivam do mesmo acervo; nada se busca duas vezes.
  const items = useMemo(() => new Map(virals.map((viral) => [viral.id, viralItem(viral, seenAt)])), [virals, seenAt]);
  const sections = useMemo(() => buildCharacterSections(virals, seenAt), [virals, seenAt]);
  const trends = useMemo(() => discoveredTrends(virals, 12), [virals]);
  const youtubeActive = status?.sources.youtube?.mode === "discovery";
  const availablePlatforms = useMemo(() => {
    const list: ExplorePlatform[] = ["instagram", "tiktok"];
    if (youtubeActive || virals.some((viral) => viral.source === "youtube")) list.push("youtube");
    return list;
  }, [virals, youtubeActive]);

  const profileCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const chip of PROFILE_CHIPS) counts.set(chip.handle, virals.filter((viral) => matchesAiProfile(viral, chip.handle)).length);
    return counts;
  }, [virals]);

  const list = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const filtered = virals
      .filter((viral) => platform === "all" || viral.source === platform)
      .filter((viral) => !profileFilter || matchesAiProfile(viral, profileFilter))
      .filter((viral) => !onlyNew || (seenAt !== null && discoveredAt(viral) > seenAt))
      .filter((viral) => !query || `${viral.title} ${viral.authorHandle} ${viral.authorName}`.toLocaleLowerCase("pt-BR").includes(query));
    const byDiscovery = (a: Viral, b: Viral) => discoveredAt(b) - discoveredAt(a);
    return filtered.sort((a, b) => {
      if (order === "published") return (b.publishedAt ?? 0) - (a.publishedAt ?? 0) || byDiscovery(a, b);
      if (order === "views") return b.views - a.views || byDiscovery(a, b);
      if (order === "likes") return b.likes - a.likes || byDiscovery(a, b);
      return byDiscovery(a, b);
    });
  }, [virals, platform, profileFilter, onlyNew, seenAt, search, order]);

  const visible = list.slice(0, limit);
  const hasPublishDates = virals.some((viral) => viral.publishedAt);
  const intervalMinutes = status ? Math.round(status.intervalMs / 60_000) : 15;
  const activeProfile = PROFILE_CHIPS.find((chip) => chip.handle === profileFilter);
  const openItem = (item: ExploreItem) => setActive(item);
  const useHref = (href: string) => router.push(href);
  const clearFilters = () => { setPlatform("all"); setSearch(""); setProfileFilter(""); setOnlyNew(false); };

  const lastTrend = trends[0]?.discoveredAt;
  const trendStatus = `${trends.length} ${trends.length === 1 ? "vídeo" : "vídeos"} da coleta que citam efeito${lastTrend ? `, o mais recente ${relativeTime(lastTrend, now)}` : ""}`;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1>Encontre sua próxima ideia.</h1>
          <p>Explore referências do Instagram, TikTok{youtubeActive ? " e YouTube" : ""} e crie com seu influencer.</p>
        </div>
        <button type="button" className="btn btn-outline" aria-expanded={importOpen} aria-controls={`${baseId}-import`} onClick={() => setImportOpen((open) => !open)}>
          <Link2 size={16} aria-hidden="true" /> Importar link
        </button>
      </header>

      {importOpen ? (
        <form id={`${baseId}-import`} className={styles.importRow} onSubmit={(event) => { event.preventDefault(); importByUrl(); }}>
          <label className="sr-only" htmlFor={`${baseId}-import-url`}>Link do vídeo</label>
          <input id={`${baseId}-import-url`} className="input" placeholder="Cole o link de um vídeo do TikTok ou de um Reel dos perfis acompanhados" value={importUrl} onChange={(event) => setImportUrl(event.target.value)} />
          <button type="submit" className="btn btn-accent" disabled={mining || !importUrl.trim()}>Importar</button>
          <p className={styles.importHint}>TikTok: qualquer vídeo de personagem de IA. Instagram: só Reels dos perfis acompanhados com mídia verificada.</p>
        </form>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Áreas de exploração">
        {([["videos", "Vídeos", "Perfis de IA em alta"], ["characters", "Descobrir personagens IA", "perfis acompanhados e novos"], ["effects", "Efeitos virais", "presets e tendências"]] as const).map(([id, label, hint]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} data-active={tab === id} className={styles.tab} onClick={() => setTab(id)}>
            {label}<small>{hint}</small>
          </button>
        ))}
      </div>

      {pendingNew > 0 ? (
        <div className={styles.newsBanner} role="status">
          <span>Há {pendingNew} {pendingNew === 1 ? "novo vídeo" : "novos vídeos"} desde que você abriu a página.</span>
          <button type="button" className="btn btn-accent btn-sm" disabled={mining} onClick={reload}><RefreshCw size={14} className={mining ? "spin" : undefined} aria-hidden="true" /> Atualizar</button>
        </div>
      ) : null}
      {error ? <div className="notice" role="alert">{error}</div> : notice ? <div className="notice" role="status">{notice}</div> : null}

      {tab === "characters" ? <CharactersTab sections={sections} now={now} availablePlatforms={availablePlatforms} onOpen={openItem} onUse={useHref} /> : null}
      {tab === "effects" ? <EffectsTab influencers={influencers} trends={trends} trendItems={items} now={now} trendStatus={trendStatus} onOpen={openItem} onUse={useHref} /> : null}

      {tab === "videos" ? (
        <>
          <div className={styles.filters}>
            <div className={styles.platforms} role="group" aria-label="Plataforma">
              {(["all", ...availablePlatforms] as Platform[]).map((id) => (
                <button key={id} type="button" className={styles.platformChip} data-active={platform === id} aria-pressed={platform === id} onClick={() => { setPlatform(id); setLimit(PAGE_SIZE); }}>
                  {id !== "all" ? <PlatformMark platform={id} size={14} /> : null}
                  {id === "all" ? "Todos" : PLATFORM_LABEL[id]}
                </button>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={16} aria-hidden="true" />
              <input className="input" aria-label="Buscar por perfil, personagem ou cena" placeholder="Buscar por perfil, personagem ou cena" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(PAGE_SIZE); }} />
            </label>
            <label className={styles.sort}>
              <span className="sr-only">Ordenar</span>
              <select className="input" value={order} onChange={(event) => setOrder(event.target.value as Order)}>
                <option value="discovered">Descobertos recentemente</option>
                {hasPublishDates ? <option value="published">Publicados recentemente</option> : null}
                <option value="views">Mais vistos</option>
                <option value="likes">Mais curtidos</option>
              </select>
            </label>
            {seenAt !== null && newCount > 0 ? (
              <button type="button" className={styles.newFilter} data-active={onlyNew} aria-pressed={onlyNew} onClick={() => { setOnlyNew((value) => !value); setLimit(PAGE_SIZE); }}>
                <Sparkles size={14} aria-hidden="true" /> Novos desde sua última visita <b>{newCount}</b>
              </button>
            ) : null}
          </div>

          <details className={styles.profiles}>
            <summary>
              <span className={styles.avatars} aria-hidden="true">
                {PROFILE_CHIPS.filter((chip) => chip.avatar).slice(0, 4).map((chip) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={chip.handle} src={chip.avatar} alt="" />
                ))}
              </span>
              <span>Explorar por perfil{activeProfile ? `: @${activeProfile.handle}` : ""}</span>
              <ChevronDown size={16} aria-hidden="true" />
              <span className={styles.statusHint}><Info size={13} aria-hidden="true" /> Atualização automática a cada {intervalMinutes} min</span>
            </summary>
            <div className={styles.profileChips} role="group" aria-label="Filtrar por perfil">
              <button type="button" className="chip" data-active={!profileFilter} aria-pressed={!profileFilter} onClick={() => { setProfileFilter(""); setLimit(PAGE_SIZE); }}>Todos os personagens</button>
              {PROFILE_CHIPS.map((chip) => (
                <button key={chip.handle} type="button" className="chip" data-active={profileFilter === chip.handle} aria-pressed={profileFilter === chip.handle} onClick={() => { setProfileFilter(chip.handle); setLimit(PAGE_SIZE); }}>
                  {chip.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chip.avatar} alt="" width={22} height={22} style={{ borderRadius: "50%", objectFit: "cover" }} />
                  ) : null}
                  @{chip.handle}
                  <span className={styles.chipCount}>{profileCounts.get(chip.handle) ?? 0}</span>
                </button>
              ))}
            </div>
          </details>

          <SourcesStatus status={status} now={now} />

          <div className={styles.resultsRow}>
            <h2>Referências para sua próxima criação</h2>
            <span>{list.length} resultado{list.length === 1 ? "" : "s"}{mining ? " · consultando…" : ""}</span>
          </div>

          {visible.length ? (
            <div className={styles.grid}>
              {visible.map((viral) => {
                const item = items.get(viral.id);
                return item ? <ExploreCard key={item.id} item={item} now={now} onOpen={() => openItem(item)} onUse={useHref} /> : null;
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              <b>{virals.length ? "Nenhum vídeo com esses filtros" : "Nenhum vídeo no acervo ainda"}</b>
              <p>{virals.length ? "Ajuste a busca, a plataforma ou o perfil." : "A coleta automática traz vídeos de personagens de IA do TikTok; você também pode buscar agora ou importar um link."}</p>
              <div className={styles.emptyActions}>
                {virals.length ? <button type="button" className="btn btn-ghost" onClick={clearFilters}>Limpar filtros</button> : null}
                <button type="button" className="btn btn-accent" disabled={mining} onClick={() => searchMore()}><RefreshCw size={15} className={mining ? "spin" : undefined} aria-hidden="true" /> Buscar no TikTok agora</button>
              </div>
            </div>
          )}

          <div className={styles.more}>
            {visible.length < list.length ? <button type="button" className="btn btn-ghost" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Carregar mais ({list.length - visible.length})</button> : null}
            {hasMore ? <button type="button" className="btn btn-ghost" disabled={mining} onClick={() => searchMore(true)}><RefreshCw size={15} className={mining ? "spin" : undefined} aria-hidden="true" /> Buscar mais no TikTok</button> : null}
          </div>
        </>
      ) : null}

      {tab !== "videos" ? <SourcesStatus status={status} now={now} /> : null}

      {active ? (
        <ExploreDialog item={active} now={now} onClose={() => setActive(null)} onUse={useHref}>
          {tab === "effects" && active.origin === "collected" ? <p className={styles.dialogText}>Tendência descoberta: inspiração com métricas e data da origem. Não é um efeito executável.</p> : null}
        </ExploreDialog>
      ) : null}
    </div>
  );
}

function sourceLine(name: string, source: SourceState | undefined, now: number): string {
  if (!source) return `${name}: status indisponível`;
  if (source.mode === "discovery" && !source.lastAttemptAt && !source.lastSuccessAt) return `${name}: descoberta configurada, nenhuma rodada executada ainda`;
  if (source.mode === "catalog") return `${name}: catálogo verificado e importação manual (sem coleta automática)`;
  if (source.mode === "inactive") return `${name}: integração pronta (API oficial), aguardando chave configurada no servidor`;
  const parts = [source.lastSuccessAt ? `atualizado ${relativeTime(source.lastSuccessAt, now)}` : "ainda sem coleta registrada"];
  if (source.lastError) parts.push(`última tentativa falhou${source.lastAttemptAt ? ` ${relativeTime(source.lastAttemptAt, now)}` : ""}; o acervo anterior foi mantido`);
  if (source.backoffUntil && source.backoffUntil > now) parts.push(`nova tentativa ${displayDateTime(source.backoffUntil, "short")}`);
  if (typeof source.lastAdded === "number" && source.lastSuccessAt) parts.push(`${source.lastAdded} novo${source.lastAdded === 1 ? "" : "s"} na última rodada`);
  return `${name}: ${parts.join(" · ")}`;
}

/** Estado real por fonte, igual nas três áreas: todas leem a mesma coleta. */
function SourcesStatus({ status, now }: { status: CollectorStatus | null; now: number }) {
  return (
    <div className={styles.statusRow} aria-live="polite">
      {status && !status.enabled ? <span className={styles.disabled}><strong>Coleta automática desligada</strong> (VIRAL_COLLECTION_ENABLED). O acervo salvo, o catálogo e a importação manual continuam.</span> : null}
      <span><strong>Fontes:</strong> {sourceLine("TikTok", status?.sources.tiktok, now)}</span>
      <span>{sourceLine("Instagram", status?.sources.instagram, now)}</span>
      <span>{sourceLine("YouTube", status?.sources.youtube, now)}</span>
      {status?.running ? <span className={styles.running}><span className="spinner" aria-hidden="true" /> coletando agora</span> : null}
    </div>
  );
}
