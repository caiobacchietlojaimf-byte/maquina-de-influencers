import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mp4Metadata } from "./video-reference";

export function publicMediaUrl(value: string) {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const base = process.env.PUBLIC_BASE_URL || process.env.APP_URL || (host ? `https://${host}` : "http://localhost:3000");
  return new URL(value, base).href;
}
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a,b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return !ip.toLowerCase().startsWith("2") && !ip.toLowerCase().startsWith("3");
}
/** DNS lookup itself cannot be cancelled, but a late answer must never start a download. */
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

/** Only server-resolved catalog/provider URLs reach this function; never accept a raw client URL. */
export async function readPublicVideo(value: string, limit = 200 * 1024 * 1024, signal?: AbortSignal): Promise<Buffer> {
  // One deadline covers DNS, every redirect and the entire response body.
  const deadline = AbortSignal.timeout(60000);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  requestSignal.throwIfAborted();
  let url = new URL(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    requestSignal.throwIfAborted();
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("O vídeo precisa estar em uma URL HTTPS pública.");
    const addresses = await withAbort(lookup(url.hostname, { all: true }), requestSignal);
    requestSignal.throwIfAborted();
    if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error("Endereço do vídeo inválido.");
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal: requestSignal });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) { await response.body?.cancel(); url = new URL(response.headers.get("location")!, url); continue; }
    if (!response.ok || !response.body) throw new Error("Não foi possível baixar o vídeo. Atualize a referência e tente novamente.");
    if (Number(response.headers.get("content-length")) > limit) { await response.body.cancel(); throw new Error("O vídeo excede o limite de processamento."); }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) { requestSignal.throwIfAborted(); const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new Error("O vídeo excede o limite de processamento."); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => undefined); }
    return Buffer.concat(chunks);
  }
  throw new Error("Redirecionamentos excessivos no vídeo.");
}
export async function inspectPublicVideo(url: string) { return mp4Metadata(await readPublicVideo(url)); }
