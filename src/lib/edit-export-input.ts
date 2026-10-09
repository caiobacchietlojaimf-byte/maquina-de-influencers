import { EDIT_ENGINES, isEditEngine } from "./character-edit";
import type { PrepareEditInput } from "./prepare-edit-client";

/** Export resolves server-owned references, never arbitrary URLs supplied by a browser. */
export function isEditExportInput(value: unknown): value is PrepareEditInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  const identifier = (part: unknown) => typeof part === "string" && part.trim().length > 0 && part.length <= 128;
  if (!identifier(input.influencerId) || !isEditEngine(input.engine)) return false;
  if (typeof input.resolution !== "string" || !(EDIT_ENGINES[input.engine].resolutions as readonly string[]).includes(input.resolution)) return false;
  if (input.targetMode !== "main" && input.targetMode !== "manual") return false;
  if (input.targetMode === "manual" && (input.engine === "fal-wan" || typeof input.target !== "string" || input.target.trim().length < 8 || input.target.length > 500)) return false;
  if (!input.source || typeof input.source !== "object") return false;
  const source = input.source as Record<string, unknown>;
  if (source.kind === "upload") return typeof source.token === "string" && source.token.length > 0 && source.token.length <= 16_384;
  if (source.kind === "profile") return identifier(source.id) && identifier(source.handle);
  return (source.kind === "viral" || source.kind === "preset") && identifier(source.id);
}
