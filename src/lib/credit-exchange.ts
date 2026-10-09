import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CreditPurchaseQuote } from "./credit-packs";

type Rate = { usdBrlRate: number; exchangeRateDate: string };
type Receipt = Rate & { userId: string; expiresAt: number };
let cached: { value: Rate; until: number } | undefined;
let pending: Promise<Rate> | undefined;
const DAY = 86400000;

function parseRate(row: unknown, now: number): Rate {
  const record = row as { cotacaoVenda?: unknown; dataHoraCotacao?: unknown };
  const rate = record?.cotacaoVenda;
  const date = typeof record?.dataHoraCotacao === "string" ? record.dataHoraCotacao.slice(0, 10) : "";
  const dateMs = Date.parse(`${date}T00:00:00Z`);
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== date || dateMs > now || now - dateMs > 8 * DAY) throw new Error("Cotação do dólar indisponível. Atualize a página em instantes.");
  return { usdBrlRate: rate, exchangeRateDate: date };
}

export async function getUsdBrlRate(): Promise<Rate> {
  const now = Date.now();
  if (cached && cached.until > now) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    const format = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}-${date.getUTCFullYear()}`;
    const url = new URL("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)");
    url.searchParams.set("@dataInicial", `'${format(new Date(now - 7 * DAY))}'`);
    url.searchParams.set("@dataFinalCotacao", `'${format(new Date(now))}'`);
    url.searchParams.set("$format", "json");
    url.searchParams.set("$orderby", "dataHoraCotacao desc");
    url.searchParams.set("$top", "1");
    // The BCB OData service requires percent-encoded spaces, not form '+' encoding.
    const response = await fetch(url.href.replaceAll("+", "%20"), { signal: AbortSignal.timeout(8000), redirect: "error", cache: "no-store" });
    if (!response.ok) throw new Error("Cotação do dólar indisponível. Atualize a página em instantes.");
    const body = await response.json();
    const value = parseRate(body?.value?.[0], now);
    cached = { value, until: now + 3600000 };
    return value;
  })();
  try { return await pending; } finally { pending = undefined; }
}

function signature(payload: string) {
  if (!process.env.AUTH_SECRET) throw new Error("Checkout indisponível.");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`credit-purchase-v1:${payload}`).digest("base64url");
}
export async function quoteCreditPurchase(userId: string): Promise<CreditPurchaseQuote> {
  const rate = await getUsdBrlRate();
  const expiresAt = Date.now() + 15 * 60000;
  const payload = Buffer.from(JSON.stringify({ ...rate, userId, expiresAt })).toString("base64url");
  return { ...rate, expiresAt, token: `${payload}.${signature(payload)}` };
}
export class CreditQuoteExpiredError extends Error {}
export function readCreditPurchaseQuote(token: string, userId: string): Receipt {
  let receipt: Receipt;
  try {
    if (typeof token !== "string" || token.length > 4096) throw new Error();
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra) throw new Error();
    const expected = Buffer.from(signature(payload)), actual = Buffer.from(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    receipt = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (receipt.userId !== userId || !Number.isSafeInteger(receipt.expiresAt)) throw new Error();
  } catch { throw new Error("Cotação inválida. Atualize a página antes de comprar."); }
  if (receipt.expiresAt <= Date.now()) throw new CreditQuoteExpiredError("Cotação expirada. Atualize a cotação antes de continuar.");
  try { parseRate({ cotacaoVenda: receipt.usdBrlRate, dataHoraCotacao: receipt.exchangeRateDate }, Date.now()); }
  catch { throw new Error("Cotação inválida. Atualize a página antes de comprar."); }
  return receipt;
}
