import "server-only";
import { exportCharacterEdit } from "./export-character-edit";

type Input = Parameters<typeof exportCharacterEdit>[0];

export function exportEditStream(input: Input, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  heartbeatMs?: number;
  prepare?: typeof exportCharacterEdit;
} = {}): ReadableStream<Uint8Array> {
  const job = new AbortController();
  const encoder = new TextEncoder();
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let stop: () => void = () => {};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = () => {
        clearTimeout(timer); clearInterval(heartbeat);
        options.signal?.removeEventListener("abort", stop);
      };
      const send = (event: unknown) => {
        if (!finished) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const finish = (result?: Awaited<ReturnType<typeof exportCharacterEdit>>) => {
        if (finished) return;
        if (result) send({ type: "result", result });
        finished = true; cleanup(); job.abort(); controller.close();
      };
      stop = () => finish();
      if (options.signal?.aborted) { finish(); return; }
      options.signal?.addEventListener("abort", stop, { once: true });
      timer = setTimeout(() => finish({ error: "A exportação ultrapassou o limite de espera. Tente novamente; nenhuma geração foi iniciada." }), options.timeoutMs ?? 190_000);
      let progress = { type: "progress" as const, stage: "auth", message: "Iniciando a exportação…" };
      send(progress);
      heartbeat = setInterval(() => send(progress), options.heartbeatMs ?? 10_000);
      void (options.prepare ?? exportCharacterEdit)(input, {
        signal: job.signal,
        onProgress(event) { progress = event; send(event); },
      }).then(result => finish(result), () => finish({ error: "Não foi possível concluir a exportação. Tente novamente; nenhuma geração foi iniciada." }));
    },
    cancel() {
      if (finished) return;
      finished = true; clearTimeout(timer); clearInterval(heartbeat);
      options.signal?.removeEventListener("abort", stop);
      job.abort();
    },
  });
}
