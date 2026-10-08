export const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
export type VideoMetadata = { duration: number; width: number; height: number; hasAudio: boolean; frameCount?: number; videoDuration?: number };
export type StudioReference = {
  kind: "profile" | "viral" | "upload";
  id: string;
  name: string;
  videoUrl: string;
  thumbnail?: string;
  duration: number;
  handle?: string;
  token?: string;
};

export function validUploadPath(path: string, userId: string): boolean {
  if (typeof path !== "string") return false;
  const prefix = `video-references/${userId}/`;
  return path.startsWith(prefix) && /^[a-f0-9-]{36}\.mp4$/.test(path.slice(prefix.length));
}

/** Read actual MP4 metadata; never trust the duration supplied by a client. */
export function mp4Duration(data: Uint8Array): number {
  return mp4Metadata(data).duration;
}

export function mp4Metadata(data: Uint8Array): VideoMetadata {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = (start: number, length: number) => String.fromCharCode(...data.subarray(start, start + length));
  function boxes(start: number, end: number) {
    const result: { type: string; start: number; end: number }[] = [];
    for (let p = start; p < end;) {
      if (p + 8 > end) throw new Error("Arquivo MP4 incompleto.");
      let size = view.getUint32(p); let header = 8;
      if (size === 1) { if (p + 16 > end) throw new Error("MP4 inválido."); size = Number(view.getBigUint64(p + 8)); header = 16; }
      if (!size) size = end - p;
      if (!Number.isSafeInteger(size) || size < header || p + size > end) throw new Error("MP4 inválido.");
      result.push({ type: text(p + 4, 4), start: p + header, end: p + size }); p += size;
    }
    return result;
  }
  const top = boxes(0, data.length);
  if (top[0]?.type !== "ftyp" || !top.some(b => b.type === "mdat" && b.end - b.start > 1000)) throw new Error("Envie um vídeo MP4 válido.");
  const moov = top.find(b => b.type === "moov");
  if (!moov) throw new Error("MP4 sem metadados de duração.");
  const children = boxes(moov.start, moov.end);
  function sampleCount(mdia: { start: number; end: number }): number | undefined {
    const minf = boxes(mdia.start, mdia.end).find(b => b.type === "minf");
    const stbl = minf && boxes(minf.start, minf.end).find(b => b.type === "stbl");
    const sizes = stbl && boxes(stbl.start, stbl.end).find(b => b.type === "stsz" || b.type === "stz2");
    if (!sizes) return undefined;
    // Both sample-size box variants store sample_count at payload offset 8.
    // Validate the full table before trusting its count for provider billing.
    if (sizes.end - sizes.start < 12 || data[sizes.start] !== 0) throw new Error("Tabela de quadros do MP4 inválida.");
    const count = view.getUint32(sizes.start + 8);
    let tableBytes: number;
    if (sizes.type === "stsz") {
      const fixedSize = view.getUint32(sizes.start + 4);
      tableBytes = fixedSize === 0 ? count * 4 : 0;
    } else {
      const fieldSize = data[sizes.start + 7];
      if (![4, 8, 16].includes(fieldSize)) throw new Error("Tabela de quadros do MP4 inválida.");
      tableBytes = Math.ceil(count * fieldSize / 8);
    }
    if (tableBytes > sizes.end - sizes.start - 12) throw new Error("Tabela de quadros do MP4 incompleta.");
    // Fragmented MP4s can have an empty table; duration × FPS is not a count.
    return count > 0 ? count : undefined;
  }
  function videoTrackDuration(mdia: { start: number; end: number }): number | undefined {
    const header = boxes(mdia.start, mdia.end).find(b => b.type === "mdhd");
    // Older/fragmented files may not declare a usable track duration. Keep
    // this optional for those files and for metadata saved before this check.
    if (!header) return undefined;
    const version = data[header.start];
    if (![0, 1].includes(version) || header.end - header.start < (version === 1 ? 36 : 24)) {
      throw new Error("Duração da faixa de vídeo do MP4 inválida.");
    }
    const scale = view.getUint32(header.start + (version === 1 ? 20 : 12));
    if (!scale) throw new Error("Escala de tempo da faixa de vídeo do MP4 inválida.");
    const ticks = version === 1 ? view.getBigUint64(header.start + 24) : BigInt(view.getUint32(header.start + 16));
    if (ticks === 0n || ticks === (version === 1 ? 0xffffffffffffffffn : 0xffffffffn)) return undefined;
    if (ticks > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Duração da faixa de vídeo do MP4 inválida.");
    return Number(ticks) / scale;
  }
  let width = 0, height = 0, hasAudio = false, frameCount: number | undefined, videoDuration: number | undefined;
  let primaryVideoFound = false;
  const hasVideo = children.filter(b => b.type === "trak").map(track => {
    const mdia = boxes(track.start, track.end).find(b => b.type === "mdia");
    const handler = mdia && boxes(mdia.start, mdia.end).find(b => b.type === "hdlr");
    const kind = handler && handler.end - handler.start >= 12 && text(handler.start + 8, 4);
    if (kind === "soun") hasAudio = true;
    if (kind === "vide" && !primaryVideoFound) {
      primaryVideoFound = true;
      frameCount = sampleCount(mdia!);
      videoDuration = videoTrackDuration(mdia!);
      const tkhd = boxes(track.start, track.end).find(b => b.type === "tkhd");
      if (tkhd && tkhd.end - tkhd.start >= 84) {
        width = view.getUint32(tkhd.end - 8) / 65536;
        height = view.getUint32(tkhd.end - 4) / 65536;
        const matrix = tkhd.end - 44;
        if (view.getInt32(matrix) === 0 && view.getInt32(matrix + 16) === 0 && view.getInt32(matrix + 4) !== 0) [width, height] = [height, width];
      }
    }
    return kind === "vide";
  }).some(Boolean);
  const header = children.find(b => b.type === "mvhd");
  if (!hasVideo || !header) throw new Error("O arquivo não contém uma faixa de vídeo válida.");
  const version = data[header.start];
  if (![0, 1].includes(version) || header.end - header.start < (version === 1 ? 32 : 20)) throw new Error("Duração do MP4 inválida.");
  const scale = view.getUint32(header.start + (version === 1 ? 20 : 12));
  const ticks = version === 1 ? Number(view.getBigUint64(header.start + 24)) : view.getUint32(header.start + 16);
  const duration = ticks / scale;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Duração do MP4 inválida.");
  return { duration, width, height, hasAudio, ...(frameCount === undefined ? {} : { frameCount }), ...(videoDuration === undefined ? {} : { videoDuration }) };
}
