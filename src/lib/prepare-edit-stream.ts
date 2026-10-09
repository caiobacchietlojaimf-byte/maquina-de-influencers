import "server-only";
import { prepareCharacterEdit } from "./prepare-character-edit";

type Input = Parameters<typeof prepareCharacterEdit>[0];

/** Independent of the Server Action queue. Disconnects stop download/encoding/upload. */
export function prepareEditStream(input: Input, options: {
  signal?: AbortSignal;
  timeoutMs?: number;
  heartbeatMs?: number;
  prepare?: typeof prepareCharacterEdit;
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
      const finish = (result?: Awaited<ReturnType<typeof prepareCharacterEdit>>) => {
        if (finished) return;
        if (result) send({ type: "result", result });
        finished = true; cleanup(); job.abort(); controller.close();
      };
      stop = () => finish();
      if (options.signal?.aborted) { finish(); return; }
      options.signal?.addEventListener("abort", stop, { once: true });
      timer = setTimeout(() => {
        console.warn("[prepare-edit] deadline reached");
        finish({ error: "A preparação ultrapassou o limite de espera. Tente novamente; nenhuma geração foi iniciada." });
      }, options.timeoutMs ?? 190_000);
      let progress = { type: "progress" as const, stage: "auth", message: "Iniciando a preparação…" };
      send(progress);
      // Repeat the last real phase to keep the connection alive during long encodes.
      heartbeat = setInterval(() => send(progress), options.heartbeatMs ?? 10_000);
      void (options.prepare ?? prepareCharacterEdit)(input, {
        signal: job.signal,
        onProgress(event) { progress = event; send(event); },
      }).then(result => finish(result), () => finish({ error: "Não foi possível concluir a preparação. Tente novamente; nenhuma geração foi iniciada." }));
    },
    cancel() {
      // A cancelled stream cannot be closed/enqueued again; late worker results are ignored.
      if (finished) return;
      finished = true; clearTimeout(timer); clearInterval(heartbeat);
      options.signal?.removeEventListener("abort", stop);
      job.abort();
    },
  });
}
