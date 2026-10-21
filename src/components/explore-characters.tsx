"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search, Sparkles, UserCheck, UserPlus, UserSearch } from "lucide-react";

import { PLATFORM_LABEL, relativeTime, type ExplorePlatform } from "@/lib/explore-format";
import type { CharacterSection, ExploreItem } from "@/lib/explore-items";
import type { CharacterKind } from "@/lib/character-discovery";
import { ExploreCard, PlatformMark } from "./explore-card";
import styles from "./explore-virals.module.css";

/* Descobrir personagens IA: perfis acompanhados (catálogo + coleta, verificados)
   e perfis que a coleta encontrou por indícios (nome do autor ou título com
   termos de IA), sempre marcados como não verificados até alguém confirmar na
   origem. A aparência do vídeo nunca entra na classificação. */

type KindFilter = "all" | CharacterKind;
type PlatformFilter = "all" | ExplorePlatform;

const KIND_LABEL: Record<CharacterKind, { label: string; title: string; icon: React.ReactElement }> = {
  tracked: { label: "Acompanhado · verificado", title: "Perfil do catálogo ou da lista de descoberta; as fontes buscam por ele", icon: <UserCheck size={13} aria-hidden="true" /> },
  discovered: { label: "Novo · não verificado", title: "Autor novo com indício forte (nome cita IA ou vários vídeos); ainda não confirmado na origem", icon: <UserPlus size={13} aria-hidden="true" /> },
  candidate: { label: "Indício · não verificado", title: "Só um vídeo com termos de IA no título; a fonte não confirma o autor", icon: <UserSearch size={13} aria-hidden="true" /> },
};

const PREVIEW_COUNT = 4;

export function CharactersTab({ sections, now, availablePlatforms, onOpen, onUse }: {
  sections: CharacterSection[];
  now: number;
  availablePlatforms: ExplorePlatform[];
  onOpen: (item: ExploreItem) => void;
  onUse: (href: string) => void;
}) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => ({
    tracked: sections.filter((section) => section.kind === "tracked").length,
    discovered: sections.filter((section) => section.kind === "discovered").length,
    candidate: sections.filter((section) => section.kind === "candidate").length,
    newVideos: sections.reduce((total, section) => total + section.newCount, 0),
  }), [sections]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return sections
      .filter((section) => kind === "all" || section.kind === kind)
      .map((section) => {
        const items = section.items
          .filter((item) => platform === "all" || item.platform === platform)
          .filter((item) => !query || `${section.name} ${section.handle} ${item.title} ${item.authorName}`.toLocaleLowerCase("pt-BR").includes(query));
        return { section, items };
      })
      .filter(({ section, items }) => items.length > 0 || (!query && platform === "all" && section.kind === "tracked"));
  }, [sections, kind, platform, search]);

  return (
    <>
      <div className={styles.filters}>
        <div className={styles.platforms} role="group" aria-label="Tipo de perfil">
          {([["all", "Todos"], ["tracked", "Acompanhados"], ["discovered", "Novos (não verificados)"], ["candidate", "Indícios"]] as const).map(([id, label]) => (
            <button key={id} type="button" className={styles.platformChip} data-active={kind === id} aria-pressed={kind === id} onClick={() => setKind(id)}>
              {id !== "all" ? KIND_LABEL[id].icon : null}
              {label}
              <span className={styles.chipCount}>{id === "all" ? sections.length : counts[id]}</span>
            </button>
          ))}
        </div>
        <div className={styles.platforms} role="group" aria-label="Plataforma">
          {(["all", ...availablePlatforms] as PlatformFilter[]).map((id) => (
            <button key={id} type="button" className={styles.platformChip} data-active={platform === id} aria-pressed={platform === id} onClick={() => setPlatform(id)}>
              {id !== "all" ? <PlatformMark platform={id} size={14} /> : null}
              {id === "all" ? "Todas" : PLATFORM_LABEL[id]}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input className="input" aria-label="Buscar personagem, perfil ou cena" placeholder="Buscar personagem, perfil ou cena" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>

      <div className={styles.statusRow} aria-live="polite">
        <span><strong>{counts.tracked}</strong> perfis acompanhados</span>
        <span><strong>{counts.discovered}</strong> {counts.discovered === 1 ? "perfil novo (não verificado)" : "perfis novos (não verificados)"}</span>
        <span><strong>{counts.candidate}</strong> {counts.candidate === 1 ? "indício a revisar" : "indícios a revisar"}</span>
        {counts.newVideos ? <span className={styles.running}><Sparkles size={12} aria-hidden="true" /> {counts.newVideos} {counts.newVideos === 1 ? "vídeo novo" : "vídeos novos"} desde sua última visita</span> : null}
      </div>

      {visible.length ? visible.map(({ section, items }) => {
        const open = expanded[section.key] ?? false;
        const shown = open ? items : items.slice(0, PREVIEW_COUNT);
        const meta = KIND_LABEL[section.kind];
        return (
          <section key={section.key} className={styles.group} aria-labelledby={`group-${section.key}`}>
            <header className={styles.groupHead}>
              {section.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.groupAvatar} src={section.avatar} alt="" />
              ) : <span className={styles.groupAvatar} aria-hidden="true">{section.name.replace(/^@/, "").slice(0, 1).toUpperCase()}</span>}
              <div className={styles.groupTitle}>
                <h2 id={`group-${section.key}`}>
                  {section.profileUrl ? <a href={section.profileUrl} target="_blank" rel="noreferrer">{section.name} <ExternalLink size={13} aria-hidden="true" /></a> : section.name}
                </h2>
                <p>
                  <span className={styles.kindBadge} data-kind={section.kind} title={meta.title}>{meta.icon}{meta.label}</span>
                  {section.platforms.map((item) => <span key={item} className={styles.groupPlatform}><PlatformMark platform={item} size={12} /> {PLATFORM_LABEL[item]}</span>)}
                  {section.followers ? <span>{section.followers} seguidores</span> : null}
                  <span>{items.length} {items.length === 1 ? "vídeo" : "vídeos"}{section.catalogCount && section.collectedCount ? ` (${section.catalogCount} do catálogo, ${section.collectedCount} da coleta)` : section.collectedCount ? " da coleta" : " do catálogo"}</span>
                  {section.lastSeenAt ? <span>último encontrado {relativeTime(section.lastSeenAt, now)}</span> : null}
                </p>
                <p className={styles.groupEvidence}>{section.kind === "tracked" && section.bio ? section.bio : section.evidence}{!section.verified ? " Confirme na origem antes de tratar como personagem de IA." : ""}</p>
              </div>
            </header>
            {items.length ? (
              <div className={styles.grid}>
                {shown.map((item) => <ExploreCard key={item.id} item={item} now={now} compact onOpen={() => onOpen(item)} onUse={onUse} />)}
              </div>
            ) : <p className={styles.groupEmpty}>Nenhum vídeo coletado deste perfil ainda. A coleta automática busca pelo nome dele.</p>}
            {items.length > PREVIEW_COUNT ? (
              <button type="button" className={`btn btn-ghost ${styles.groupMore}`} aria-expanded={open} onClick={() => setExpanded((state) => ({ ...state, [section.key]: !open }))}>
                <ChevronDown size={15} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} /> {open ? "Mostrar menos" : `Ver todos os ${items.length} vídeos`}
              </button>
            ) : null}
          </section>
        );
      }) : (
        <div className={styles.empty}>
          <b>Nenhum personagem com esses filtros</b>
          <p>Ajuste a busca, o tipo de perfil ou a plataforma.</p>
          <div className={styles.emptyActions}><button type="button" className="btn btn-ghost" onClick={() => { setKind("all"); setPlatform("all"); setSearch(""); }}>Limpar filtros</button></div>
        </div>
      )}
    </>
  );
}
