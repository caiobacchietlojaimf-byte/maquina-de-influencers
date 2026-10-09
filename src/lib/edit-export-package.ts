import "server-only";
import { buildCharacterEditPrompt, buildProviderEditInput, EDIT_ENGINES, isEditEngine, type EditEngine, type EditResolution } from "./character-edit";
import { mp4Metadata, type VideoMetadata } from "./video-reference";

export type EditExportInput = {
  name: string;
  influencerName: string;
  engine: EditEngine;
  resolution: EditResolution;
  target: string;
  metadata: VideoMetadata;
  image: Buffer;
  original: Buffer;
  segments: Array<{ start: number; bytes: Buffer }>;
};
export type EditExportEntry = { name: string; bytes: Buffer };

function imageFilename(bytes: Buffer): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "influencer.png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "influencer.jpg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "influencer.webp";
  throw new Error("A imagem do influencer precisa estar em PNG, JPEG ou WebP para exportar.");
}

function label(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
}
const seconds = (value: number) => `${value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}s`;

/** Pure packaging: no provider calls, balance checks, storage writes or credentials. */
export function buildEditExportEntries(input: EditExportInput): EditExportEntry[] {
  if (!isEditEngine(input.engine)) throw new Error("Modelo de exportação inválido.");
  const engine = EDIT_ENGINES[input.engine];
  if (!(engine.resolutions as readonly string[]).includes(input.resolution)) throw new Error("Resolução de exportação inválida para o modelo escolhido.");
  if (!input.original.length || !Number.isFinite(input.metadata.duration) || input.metadata.duration <= 0) throw new Error("O vídeo original está indisponível para exportação.");
  if (!input.target.trim()) throw new Error("Escolha quem será substituído antes de exportar.");
  const image = imageFilename(input.image);
  const name = label(input.name) || "Vídeo de referência";
  const influencerName = label(input.influencerName) || "Meu influencer";
  const multiple = input.segments.length > 1;
  const wan = input.engine === "fal-wan";
  const entries: EditExportEntry[] = [
    // Retain original bytes, including its complete original audio track.
    { name: "original.mp4", bytes: input.original },
    { name: image, bytes: input.image },
    { name: "prompts/universal.txt", bytes: Buffer.from(buildCharacterEditPrompt(input.target, input.metadata.duration), "utf8") },
  ];
  const prepared = multiple ? input.segments.map((segment, index) => ({
    index: index + 1,
    start: segment.start,
    file: `trechos/${String(index + 1).padStart(2, "0")}.mp4`,
    metadata: mp4Metadata(segment.bytes),
    bytes: segment.bytes,
  })) : [{ index: 1, start: 0, file: "original.mp4", metadata: input.metadata, bytes: input.original }];
  if (prepared.some(part => !Number.isFinite(part.start) || part.start < 0)) throw new Error("A ordem dos trechos está inválida.");
  const segments = prepared.map(part => {
    if (multiple) entries.push({ name: part.file, bytes: part.bytes });
    // Local filenames intentionally replace API URLs. The guide explains that
    // the user must upload/select these files in the external application.
    const settings = buildProviderEditInput(input.engine, part.file, image, input.target, part.metadata.duration, input.resolution, 0);
    const promptFile = typeof settings.prompt === "string" ? (multiple ? `prompts/trecho-${String(part.index).padStart(2, "0")}.txt` : "prompts/modelo.txt") : undefined;
    if (promptFile) entries.push({ name: promptFile, bytes: Buffer.from(settings.prompt as string, "utf8") });
    return { index: part.index, start: part.start, file: part.file, metadata: part.metadata, ...(promptFile ? { promptFile } : {}), input: settings };
  });

  const configuration = {
    version: 1,
    name,
    engine: input.engine,
    provider: engine.provider,
    model: engine.model,
    resolution: input.resolution,
    influencer: { name: influencerName, file: image },
    target: input.target,
    original: { file: "original.mp4", metadata: input.metadata },
    universalPromptFile: "prompts/universal.txt",
    acceptsEditingPrompt: !wan,
    localFileReferences: true,
    ...(wan ? { seed: 0 } : {}),
    segments,
  };
  entries.push({ name: "config.json", bytes: Buffer.from(JSON.stringify(configuration, null, 2) + "\n", "utf8") });

  const instructions = [
    "PACOTE PARA TROCAR O PERSONAGEM EM OUTRO APLICATIVO",
    "",
    `Referência: ${name}`,
    `Influencer: ${influencerName}`,
    `Modelo escolhido: ${engine.label}`,
    `Identificador do modelo: ${engine.model}`,
    `Qualidade: ${input.resolution === "auto" ? "resolução definida pelo modelo" : input.resolution}`,
    `Original: ${seconds(input.metadata.duration)} · ${input.metadata.width} × ${input.metadata.height}`,
    "",
    "1. Abra um aplicativo que ofereça edição de vídeo com imagem de personagem e escolha o modelo indicado acima, quando disponível.",
    `2. Envie ${image} como a imagem de referência do personagem. Ela define a identidade e a roupa de ${influencerName}.`,
    multiple
      ? "3. Edite os arquivos da pasta trechos em ordem. Use a mesma imagem do influencer e a mesma pessoa-alvo em todos eles."
      : "3. Envie original.mp4 como o vídeo a ser editado. Preserve a duração completa e o enquadramento.",
  ];
  if (wan) {
    instructions.push(
      "4. Wan 2.2 Animate — Replace usa o vídeo e a imagem de referência; a API desse modelo NÃO aceita prompt de edição nem descrição para escolher uma pessoa. Prefira uma cena com um único personagem visível.",
      "   O arquivo prompts/universal.txt é opcional para OUTROS aplicativos ou modelos que aceitam edição por instrução. Ele não é um campo de entrada do Wan Replace.",
      "   As configurações de referência estão em config.json, incluindo seed 0. Ajuste-as somente se a ferramenta oferecer essas opções.",
    );
  } else {
    instructions.push(multiple
      ? "4. Para cada trecho, copie o texto correspondente de prompts/trecho-01.txt, prompts/trecho-02.txt e assim por diante no campo de edição."
      : "4. Copie prompts/modelo.txt no campo de instrução de edição.");
    if (input.engine.startsWith("fal-kling")) instructions.push("   No Kling, @Video1 indica o vídeo deste trecho e @Image1 indica a imagem do influencer. Associe essas referências aos arquivos enviados.");
    instructions.push("   Em outro editor por instrução, prompts/universal.txt descreve a edição do vídeo original completo. Ajuste os nomes de referência ao formato aceito pelo aplicativo.");
  }
  instructions.push(
    multiple ? "5. Depois de gerar os trechos, monte os resultados na ordem abaixo, mantendo cada um na posição e duração do original." : "5. Confira o resultado completo: o personagem, a duração, a câmera, o cenário e as demais pessoas.",
    input.metadata.hasAudio
      ? "6. Na montagem final, use a faixa de áudio COMPLETA de original.mp4, começando em 0s. Preserve esse áudio original; desative ou substitua o áudio criado pelo outro aplicativo."
      : "6. O vídeo original não contém faixa de áudio. O pacote mantém o original sem áudio e não cria uma nova faixa.",
    "",
  );
  if (multiple) {
    instructions.push("ORDEM E TEMPOS DOS TRECHOS");
    for (const part of prepared) {
      const pictureDuration = part.metadata.videoDuration ?? part.metadata.duration;
      instructions.push(`${part.file}: início ${seconds(part.start)}, duração das imagens ${seconds(pictureDuration)}, fim ${seconds(part.start + pictureDuration)}${segments[part.index - 1].promptFile ? `; instrução em ${segments[part.index - 1].promptFile}` : ""}.`);
    }
    if (prepared.every(part => !part.metadata.hasAudio)) instructions.push("Os trechos preparados contêm somente as imagens. A faixa sonora completa, quando presente, está em original.mp4.");
    instructions.push("O original completo também está incluído para aplicativos que aceitam trabalhar com ele sem dividir.", "");
  }
  instructions.push(
    "ARQUIVOS E CONFIGURAÇÕES",
    "original.mp4 e a imagem do influencer mantêm os bytes dos arquivos originais, sem recompressão pela exportação.",
    "config.json registra o modelo, a qualidade, a ordem dos trechos e os parâmetros de referência. Os valores de video_url, image_url e image_urls são CAMINHOS LOCAIS deste ZIP: envie os arquivos ao aplicativo; esses caminhos não são URLs públicas nem uma requisição pronta para API.",
    "A exportação reúne os arquivos e as instruções; não inicia geração nem consome créditos de geração do sistema. O outro aplicativo usa as opções e o saldo da sua própria conta nele.",
    "Os aplicativos podem usar configurações ou versões de modelo diferentes. O resultado externo pode variar; confira a troca do personagem, a imagem e o áudio antes de publicar.",
    "",
  );
  entries.unshift({ name: "LEIA-ME.txt", bytes: Buffer.from(instructions.join("\n"), "utf8") });
  return entries;
}
