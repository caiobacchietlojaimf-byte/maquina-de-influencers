export const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;
export type VideoMetadata = { duration: number; width: number; height: number; hasAudio: boolean };
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
      if (size < header || p + size > end) throw new Error("MP4 inválido.");
      result.push({ type: text(p + 4, 4), start: p + header, end: p + size }); p += size;
    }
    return result;
  }
  const top = boxes(0, data.length);
  if (top[0]?.type !== "ftyp" || !top.some(b => b.type === "mdat" && b.end - b.start > 1000)) throw new Error("Envie um vídeo MP4 válido.");
  const moov = top.find(b => b.type === "moov");
  if (!moov) throw new Error("MP4 sem metadados de duração.");
  const children = boxes(moov.start, moov.end);
  let width = 0, height = 0, hasAudio = false;
  const hasVideo = children.filter(b => b.type === "trak").map(track => {
    const mdia = boxes(track.start, track.end).find(b => b.type === "mdia");
    const handler = mdia && boxes(mdia.start, mdia.end).find(b => b.type === "hdlr");
    const kind = handler && text(handler.start + 8, 4);
    if (kind === "soun") hasAudio = true;
    if (kind === "vide") {
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
  return { duration, width, height, hasAudio };
}
