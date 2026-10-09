"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, LoaderCircle, Mail, RotateCcw } from "lucide-react";
import { PLAN_CATALOG, getPlan, type PlanId } from "@/lib/plans";
import { CREDIT_PACKS, type CreditPurchaseQuote } from "@/lib/credit-packs";
import { createCheckoutAction, createCreditCheckoutAction, refreshPaymentAction } from "@/app/actions/billing";
import type { Order } from "@/lib/commerce";
import { displayDate } from "@/lib/display-date";
import styles from "./commerce.module.css";

const statusLabel: Record<Order["status"], string> = {
  creating: "Preparando PIX", pending: "Aguardando pagamento", paid: "Pagamento confirmado",
  failed: "Pagamento não concluído", refunded: "Pagamento estornado", review: "Aguardando conferência",
};
const unresolved = (order: Order) => ["creating", "pending", "review"].includes(order.status);
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dollar = (cents: number) => `US$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const orderLabel = (order: Order) => order.planId ? getPlan(order.planId)?.name ?? "Plano" : `${order.credits.toLocaleString("pt-BR")} créditos`;
const exchangeDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split("-").reverse().join("/") : "data indisponível";
const DEFAULT_PACK = CREDIT_PACKS.find(pack => pack.credits === 100)!.id;

export function BillingCenter({ name, orders, enabled, currentPlan, initialPlan, supportEmail, mode = "plan", creditQuote = null }: {
  name: string;
  orders: Order[];
  enabled: boolean;
  currentPlan: PlanId | null;
  initialPlan?: PlanId;
  supportEmail?: string;
  mode?: "plan" | "credits";
  creditQuote?: CreditPurchaseQuote | null;
}) {
  const router = useRouter();
  const creditMode = mode === "credits";
  const navigationPlan = initialPlan ?? currentPlan ?? "pro";
  const [planId, setPlanId] = useState<PlanId>(navigationPlan);
  const [packId, setPackId] = useState(DEFAULT_PACK);
  const [rejectedQuoteToken, setRejectedQuoteToken] = useState<string | null>(null);
  const [refreshingQuote, startQuoteRefresh] = useTransition();
  const [requestKey, setRequestKey] = useState("");
  const [updates, setUpdates] = useState<Record<string, Order>>({});
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => orders.find(unresolved)?.id ?? null);
  const [pending, setPending] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const nonce = useRef("");
  const lastNavigationPlan = useRef(navigationPlan);
  const uncertainPayload = useRef<FormData | null>(null);
  const mounted = useRef(true);
  const pixField = useRef<HTMLTextAreaElement>(null);
  const firstPlan = useRef<HTMLButtonElement>(null);
  const orderHeading = useRef<HTMLHeadingElement>(null);

  const history = useMemo(() => {
    const records = new Map(orders.map(order => [order.id, order]));
    for (const order of Object.values(updates)) {
      if (!records.has(order.id) || order.updatedAt >= records.get(order.id)!.updatedAt) records.set(order.id, order);
    }
    return [...records.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, updates]);
  const current = history.find(order => order.id === selectedOrderId) ?? history.find(unresolved);
  const selectedPlan = current?.planId ?? planId;
  const plan = getPlan(selectedPlan)!;
  const selectedPackId = current ? CREDIT_PACKS.find(pack => pack.credits === current.credits)?.id : packId;
  const pack = CREDIT_PACKS.find(item => item.id === packId)!;
  const quoteReady = Boolean(creditQuote?.token && creditQuote.token !== rejectedQuoteToken && Number.isFinite(creditQuote.usdBrlRate) && creditQuote.usdBrlRate > 0);
  const packPrice = quoteReady ? Math.round(pack.usdAmountCents * creditQuote!.usdBrlRate) / 100 : null;
  const controlsLocked = Boolean(current) || pending || refreshingId !== null || uncertain || refreshingQuote;

  function renewNonce(): boolean {
    try {
      const key = crypto.randomUUID();
      nonce.current = key;
      setRequestKey(key);
      return true;
    } catch {
      setError("Não foi possível preparar uma solicitação segura. Recarregue a página para tentar novamente.");
      return false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    if (!nonce.current) renewNonce();
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (lastNavigationPlan.current === navigationPlan) return;
    lastNavigationPlan.current = navigationPlan;
    if (!current && !pending && !uncertain) {
      setPlanId(navigationPlan);
      setError(null);
    }
  }, [navigationPlan, current, pending, uncertain]);

  function remember(order: Order) {
    setUpdates(previous => ({ ...previous, [order.id]: order }));
    setSelectedOrderId(order.id);
    setCopied(false);
  }

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || current || !enabled || !nonce.current || refreshingQuote) return;
    if (creditMode && !uncertainPayload.current && (!quoteReady || Date.now() >= creditQuote!.expiresAt)) {
      if (creditQuote?.token) setRejectedQuoteToken(creditQuote.token);
      setError("A cotação está indisponível ou expirou. Atualize a cotação antes de gerar o PIX.");
      return;
    }
    const payload = uncertainPayload.current ?? new FormData(event.currentTarget);
    if (!uncertainPayload.current) {
      payload.set("requestKey", nonce.current);
      if (creditMode) {
        payload.set("packId", packId);
        payload.set("quoteToken", creditQuote!.token);
      } else payload.set("planId", planId);
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await (creditMode ? createCreditCheckoutAction : createCheckoutAction)(null, payload);
      if (!mounted.current) return;
      if (result?.order) {
        remember(result.order);
        uncertainPayload.current = null;
        setUncertain(false);
        requestAnimationFrame(() => orderHeading.current?.focus());
        if (result.order.status === "paid") router.refresh();
      } else {
        // Keep the nonce on every error: an order may already exist server-side.
        if (creditMode && result?.quoteExpired) {
          // The server only returns this flag after confirming that this nonce
          // has no order. A new quote can safely reuse the same request key.
          setRejectedQuoteToken(String(payload.get("quoteToken") ?? ""));
          uncertainPayload.current = null;
          setUncertain(false);
        }
        setError(result?.error ?? "Não foi possível confirmar a solicitação. Tente novamente.");
      }
    } catch {
      if (!mounted.current) return;
      uncertainPayload.current = payload;
      setUncertain(true);
      setError("A conexão foi interrompida. Confira esta mesma solicitação antes de iniciar outro pedido.");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  async function check(order: Order) {
    if (busy.current) return;
    busy.current = true;
    setSelectedOrderId(order.id);
    setRefreshingId(order.id);
    setCopied(false);
    setError(null);
    try {
      const result = await refreshPaymentAction(order.id);
      if (!mounted.current) return;
      if (result?.order) {
        remember(result.order);
        if (result.order.status === "paid" || result.order.status === "refunded") router.refresh();
      }
      if (result?.error) setError(result.error);
      else if (!result?.order) setError("O pagamento ainda não foi conferido. Tente novamente em instantes.");
    } catch {
      if (mounted.current) setError("Não foi possível conferir o pagamento por causa da conexão. Seu pedido foi mantido; tente consultar novamente.");
    } finally {
      busy.current = false;
      if (mounted.current) setRefreshingId(null);
    }
  }

  function newOrder() {
    if (busy.current || !current || !["failed", "paid", "refunded"].includes(current.status)) return;
    const otherOpen = history.find(order => order.id !== current.id && unresolved(order));
    if (otherOpen) {
      setSelectedOrderId(otherOpen.id);
      setError("Você tem outro pedido em aberto. Confira esse pagamento antes de criar um novo.");
      return;
    }
    if (!renewNonce()) return;
    uncertainPayload.current = null;
    setUncertain(false);
    setSelectedOrderId(null);
    setError(null);
    setCopied(false);
    setPlanId(navigationPlan);
    setPackId(DEFAULT_PACK);
    requestAnimationFrame(() => firstPlan.current?.focus());
  }

  function refreshQuote() {
    if (controlsLocked || busy.current) return;
    setError(null);
    startQuoteRefresh(() => { router.refresh(); });
  }

  async function copyPix() {
    if (!current?.pixCode) return;
    try {
      await navigator.clipboard.writeText(current.pixCode);
      if (mounted.current) { setCopied(true); setError(null); }
    } catch {
      pixField.current?.focus();
      pixField.current?.select();
      if (mounted.current) setError("Não foi possível copiar automaticamente. Selecione e copie o código no campo PIX Copia e Cola.");
    }
  }

  return <div className={styles.wrap}>
    {creditMode ? <>
      <div className={styles.creditIntro}><h2>10 créditos = US$1</h2><p>Adicione saldo para criar, sem alterar seu plano. Os créditos entram após a confirmação do PIX.</p></div>
      <div className={styles.creditGrid} role="group" aria-label="Escolher pacote de créditos">
        {CREDIT_PACKS.map((item, index) => <button ref={index === 0 ? firstPlan : undefined} type="button" key={item.id}
          aria-pressed={selectedPackId === item.id} disabled={controlsLocked}
          className={`${styles.plan} ${selectedPackId === item.id ? styles.selected : ""}`}
          onClick={() => { if (!busy.current && !controlsLocked) { setPackId(item.id); setError(null); } }}>
          <span className={styles.eyebrow}>{item.credits.toLocaleString("pt-BR")} créditos</span>
          <strong className={styles.price}>{dollar(item.usdAmountCents)}</strong>
          <span className={styles.muted}>{quoteReady ? `${money(Math.round(item.usdAmountCents * creditQuote!.usdBrlRate) / 100)} no PIX` : "Aguardando cotação em reais"}</span>
        </button>)}
      </div>
      <div className={`${styles.notice} ${styles.quoteNotice}`} aria-busy={refreshingQuote}>
        <p>{quoteReady ? <>Cotação de {exchangeDate(creditQuote!.exchangeRateDate)}: US$ 1 = R$ {creditQuote!.usdBrlRate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}. O PIX é emitido em reais.</> : "A cotação em reais ainda não está disponível. Atualize para conferir o valor antes de pagar."}</p>
        <button type="button" className="btn btn-ghost" disabled={controlsLocked} onClick={refreshQuote}><RotateCcw size={16} aria-hidden="true" />{refreshingQuote ? "Atualizando cotação…" : "Atualizar cotação"}</button>
      </div>
    </> : <><div className={styles.planGrid} role="group" aria-label="Escolher plano">
      {PLAN_CATALOG.map((item, index) => <button ref={index === 0 ? firstPlan : undefined} type="button" key={item.id}
        aria-pressed={selectedPlan === item.id} disabled={controlsLocked}
        className={`${styles.plan} ${selectedPlan === item.id ? styles.selected : ""}`}
        onClick={() => { if (!busy.current && !controlsLocked) { setPlanId(item.id); setError(null); } }}>
        <span className={styles.eyebrow}>{item.name}{currentPlan === item.id ? " · Seu plano" : ""}</span>
        <strong className={styles.price}>{item.priceMonthlyBRL.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}<small>/ 30 dias</small></strong>
        <span>{item.summary}</span><ul>{item.features.map(feature => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul>
      </button>)}
    </div>
    <p className={styles.muted}>Valores de lançamento em definição. Pagamento único via PIX, renovação manual. Os créditos são adicionados após a confirmação. Aulas gravadas de Criação Ilimitada ainda não disponíveis; GPU e serviços externos têm custos próprios.</p></>}
    {!enabled ? <div className={styles.notice}>Checkout em configuração. Os pagamentos ainda não estão disponíveis.</div> : null}
    {enabled || current ? <section className={styles.panel} aria-busy={pending || refreshingId !== null}>
      {!current ? <form onSubmit={checkout} className={styles.form}>
        <h2>{creditMode ? `Adicionar ${pack.credits.toLocaleString("pt-BR")} créditos` : `Começar com ${plan.name}`}</h2>
        {creditMode ? <><input type="hidden" name="packId" value={packId} /><input type="hidden" name="quoteToken" value={creditQuote?.token ?? ""} /></> : <input type="hidden" name="planId" value={planId} />}<input type="hidden" name="requestKey" value={requestKey} />
        <label>Nome completo<input name="name" defaultValue={name} autoComplete="name" required minLength={3} maxLength={120} disabled={pending || uncertain} /></label>
        <label>CPF<input name="cpf" autoComplete="off" inputMode="numeric" required maxLength={14} disabled={pending || uncertain} /></label>
        <label>Telefone com DDD<input name="phone" autoComplete="tel" inputMode="tel" required maxLength={18} disabled={pending || uncertain} /></label>
        <p className={styles.muted}>Seus dados de cobrança são enviados à Sync Pay para emitir o PIX. Seu CPF e telefone não são salvos na nossa base.</p>
        <button type="submit" className="btn btn-accent" disabled={pending || refreshingQuote || !requestKey || (creditMode && !uncertain && !quoteReady)}>
          {pending ? <><LoaderCircle size={18} className={styles.spinner} aria-hidden="true" /> Preparando…</> : uncertain ? "Conferir esta solicitação" : creditMode ? packPrice === null ? "Aguardando cotação" : `Gerar PIX de ${money(packPrice)}` : `Gerar PIX de ${money(plan.priceMonthlyBRL)}`}
        </button>
      </form> : <div className={styles.form}>
        <h2 ref={orderHeading} tabIndex={-1}>{statusLabel[current.status]}</h2>
        <p className={styles.orderReference}>{current.planId ? "Plano " : ""}{orderLabel(current)} · {money(current.amountCents / 100)} · Pedido {current.id}</p>
        {current.error ? <p role="alert">{current.error}</p> : null}
        {current.pixCode && current.status === "pending" ? <>
          <label>PIX Copia e Cola<textarea ref={pixField} readOnly value={current.pixCode} rows={3} /></label>
          <button type="button" className="btn btn-accent" onClick={() => { void copyPix(); }}><Copy size={17} aria-hidden="true" />{copied ? "PIX copiado" : "Copiar PIX"}</button>
          <span role="status" className="sr-only">{copied ? "Código PIX copiado." : ""}</span>
        </> : null}
        {current.status === "creating" ? <p className={styles.muted}>O pedido está sendo preparado. Consulte o mesmo pedido antes de tentar novamente.</p> : null}
        {current.status === "review" ? <div className={styles.notice}><p>A emissão ainda precisa de confirmação. Procure o suporte e informe o número deste pedido antes de criar outra cobrança.</p>{supportEmail ? <a className="btn btn-ghost" href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Conferência do pedido ${current.id}`)}`}><Mail size={16} aria-hidden="true" />Falar com o suporte</a> : null}</div> : null}
        {unresolved(current) ? <button type="button" className="btn btn-ghost" disabled={refreshingId !== null || pending} onClick={() => { void check(current); }}>
          <RotateCcw size={16} aria-hidden="true" />{refreshingId ? "Conferindo…" : current.status === "pending" ? "Já paguei · conferir pagamento" : "Conferir este pedido"}
        </button> : null}
        {current.status === "failed" ? <><p className={styles.muted}>O provedor confirmou que este pagamento não foi concluído. Você pode {creditMode ? "escolher um pacote" : "escolher um plano"} e iniciar outro pedido.</p><button type="button" className="btn btn-accent" disabled={pending || refreshingId !== null} onClick={newOrder}>{creditMode ? "Comprar mais créditos" : "Escolher outro plano / novo pedido"}</button></> : null}
        {current.status === "paid" ? <><p className={styles.muted}>{creditMode ? "Pagamento confirmado. Os créditos desta compra foram adicionados ao seu saldo, sem alterar seu plano." : "Pagamento confirmado. Seus créditos e acessos são atualizados após a confirmação."}</p><Link href="/app/influencers" className="btn btn-accent">Criar meu influencer</Link></> : null}
        {current.status === "refunded" ? <p className={styles.muted}>{creditMode ? "Este pagamento foi estornado e os créditos desta compra foram revistos. Seu plano permanece o mesmo." : "Este pagamento foi estornado. Os créditos e acessos vinculados ao pedido foram revistos."}</p> : null}
        {current.status === "paid" || current.status === "refunded" ? <button type="button" className="btn btn-ghost" disabled={pending || refreshingId !== null} onClick={newOrder}>{creditMode ? "Comprar mais créditos" : "Voltar aos planos"}</button> : null}
      </div>}
      <p role="status" className="sr-only">{pending ? "Preparando sua solicitação de pagamento." : refreshingId ? "Conferindo pagamento." : ""}</p>
      {error ? <p role="alert" className={styles.billingError}>{error}</p> : null}
    </section> : error ? <p role="alert" className={styles.billingError}>{error}</p> : null}
    <section className={styles.panel}>
      <h2>Meus pedidos</h2>
      {!history.length ? <p className={styles.muted}>Seus pagamentos aparecerão aqui.</p> : <div className={styles.tableScroll}><table>
        <thead><tr><th>{creditMode ? "Créditos" : "Plano"}</th><th>Valor</th><th>Status</th><th>Data</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>{history.map(order => <tr key={order.id}><td>{orderLabel(order)}</td><td>{money(order.amountCents / 100)}</td><td>{statusLabel[order.status]}</td><td>{displayDate(order.createdAt)}</td><td>
          {unresolved(order) ? <button type="button" className="btn btn-ghost" disabled={refreshingId !== null || pending || uncertain} onClick={() => { void check(order); }}>{refreshingId === order.id ? "Conferindo…" : "Consultar"}</button> : <button type="button" className="btn btn-ghost" disabled={refreshingId !== null || pending || uncertain} onClick={() => { setSelectedOrderId(order.id); setError(null); setCopied(false); requestAnimationFrame(() => orderHeading.current?.focus()); }}>Ver pedido</button>}
        </td></tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
