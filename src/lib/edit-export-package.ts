import "server-only";
import { createHash } from "node:crypto";
import { buildProviderEditInput, EDIT_ENGINES, isEditEngine, type EditEngine, type EditResolution } from "./character-edit";
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
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const textEntry = (name: string, lines: string[]): EditExportEntry => ({ name, bytes: Buffer.from(lines.join("\n") + "\n", "utf8") });

/** The model receives an edit instruction; the assistant receives the tool-selection protocol separately. */
function editPrompt(target: string, duration: number, kling = false): string {
  return [
    kling ? "Edit @Video1 using @Image1 only for the replacement person's identity and clothing." : "Edit the attached source VIDEO using the attached character IMAGE only for the replacement person's identity and clothing.",
    `Replace only this source person: ${JSON.stringify(target)}. Track the same person through the whole clip, including occlusions.`,
    "Keep their original actions, gestures, expressions, positions, scale and timing. Fit the new appearance to the existing pose, perspective, lighting and shadows; do not copy the image's pose or background.",
    `Preserve the entire ${duration.toFixed(3)}-second source timeline, original framing, aspect ratio, camera movement, cuts and speed. Keep the background, other people, objects, text and source audio unchanged.`,
    "Make only the localized person replacement. Do not restage the scene, invent actions, move the camera, crop, loop, shorten or add shots. Return the edited video.",
  ].join("\n");
}

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
  const kling = input.engine.startsWith("fal-kling");
  const pictureDuration = input.metadata.videoDuration ?? input.metadata.duration;
  const frameDuration = input.metadata.frameCount ? pictureDuration / input.metadata.frameCount : 0.05;
  const checkpoints = [...[0, 0.25, 0.5, 0.75].map(fraction => pictureDuration * fraction), Math.max(0, pictureDuration - frameDuration)]
    .map(timestamp => Number(timestamp.toFixed(3)));
  const entries: EditExportEntry[] = [
    // Retain original bytes, including its complete original audio track.
    { name: "original.mp4", bytes: input.original },
    { name: image, bytes: input.image },
    textEntry("prompts/universal.txt", [editPrompt(input.target, input.metadata.duration)]),
  ];
  const prepared = multiple ? input.segments.map((segment, index) => ({
    index: index + 1, start: segment.start,
    file: `trechos/${String(index + 1).padStart(2, "0")}.mp4`,
    metadata: mp4Metadata(segment.bytes), bytes: segment.bytes,
  })) : [{ index: 1, start: 0, file: "original.mp4", metadata: input.metadata, bytes: input.original }];
  if (prepared.some(part => !Number.isFinite(part.start) || part.start < 0)) throw new Error("A ordem dos trechos está inválida.");
  const segments = prepared.map(part => {
    if (multiple) entries.push({ name: part.file, bytes: part.bytes });
    // Filenames are deliberately local. This manifest never executes a request.
    const settings = buildProviderEditInput(input.engine, part.file, image, input.target, part.metadata.duration, input.resolution, 0);
    const promptFile = typeof settings.prompt === "string" ? (multiple ? `prompts/trecho-${String(part.index).padStart(2, "0")}.txt` : "prompts/modelo.txt") : undefined;
    if (promptFile) {
      settings.prompt = editPrompt(input.target, part.metadata.duration, kling);
      entries.push({ name: promptFile, bytes: Buffer.from(settings.prompt as string, "utf8") });
    }
    return { index: part.index, start: part.start, file: part.file, sha256: sha256(part.bytes), metadata: part.metadata, ...(promptFile ? { promptFile } : {}), input: settings };
  });
  // An explicit handoff contract, not a claim that an external assistant enforces it.
  const executionPolicy = {
    requiresFullVideoInput: true, requiresLocalizedVideoEditing: true,
    allowModelFallback: false, allowTextToVideo: false, allowImageToVideo: false, allowApiBilling: false,
  };
  const audioInstruction = input.metadata.hasAudio
    ? "Use a faixa de áudio COMPLETA de original.mp4, começando em 0s, no arquivo final. Substitua o áudio gerado, mantendo sincronismo e duração; não crie música ou voz. Quando possível, copie a faixa sem recodificar."
    : "O original não contém faixa de áudio. Mantenha o resultado sem áudio; não crie música, voz ou efeitos.";
  const modelInstruction = wan
    ? "Wan 2.2 Animate — Replace recebe vídeo e imagem e NÃO aceita prompt de edição nem seleção de pessoa por texto. Use somente se houver um único personagem adequado à troca; se houver ambiguidade, pare e informe a limitação. Não envie nenhum arquivo de prompt como parâmetro do Wan."
    : input.engine === "higgsfield"
      ? "Selecione Genjutsu Object Swap, NÃO Motion Transfer ou Image-to-Video. Associe original.mp4 ao vídeo que será editado e a imagem ao personagem substituto. Use prompts/modelo.txt no campo de edição."
      : `Selecione Kling O3 ${input.engine === "fal-kling-pro" ? "Pro" : "Standard"} no modo Video-to-Video Edit, com vídeo de entrada e imagem de personagem. NÃO Kling Motion Control, Text-to-Video ou Image-to-Video. Vincule @Video1 ao vídeo completo da etapa e @Image1 à imagem do influencer. Use ${multiple ? "o prompt correspondente a cada trecho" : "prompts/modelo.txt"} no campo de edição.`;
  const configuration = {
    version: 2, name, engine: input.engine, provider: engine.provider, model: engine.model,
    resolution: input.resolution, handoffFile: "COMECE-AQUI.txt", executionPolicy,
    influencer: { name: influencerName, file: image, sha256: sha256(input.image) },
    target: input.target,
    original: { file: "original.mp4", sha256: sha256(input.original), metadata: input.metadata },
    validation: { guideFile: "CONFERIR-RESULTADO.txt", checkpointsSeconds: checkpoints, requiresVisualComparison: true, preserveOriginalAudio: input.metadata.hasAudio },
    universalPromptFile: "prompts/universal.txt", acceptsEditingPrompt: !wan, localFileReferences: true,
    ...(wan ? { seed: 0 } : {}), segments,
  };
  entries.push(textEntry("config.json", [JSON.stringify(configuration, null, 2)]));

  const timing = prepared.map(part => {
    const duration = part.metadata.videoDuration ?? part.metadata.duration;
    return `${part.file}: início ${seconds(part.start)}, imagens ${seconds(duration)}, fim ${seconds(part.start + duration)}${segments[part.index - 1].promptFile ? `; prompt: ${segments[part.index - 1].promptFile}` : ""}.`;
  });
  entries.unshift(textEntry("COMECE-AQUI.txt", [
    "INSTRUÇÃO PARA O ASSISTENTE QUE VAI EXECUTAR A EDIÇÃO",
    "Quero editar os pixels do vídeo anexado, substituindo apenas o personagem indicado pela pessoa da imagem. Não quero uma reconstituição do vídeo baseada em descrição, análise de frames ou storyboard.",
    "",
    "1. VERIFIQUE A FERRAMENTA ANTES DE GERAR",
    `Modelo escolhido neste pacote: ${engine.label}. Identificador técnico: ${engine.model}.`,
    modelInstruction,
    "Verifique nas ferramentas realmente disponíveis se esse modelo/modo aceita o arquivo de vídeo como entrada temporal de edição e a imagem como identidade. Não deduza suporte só porque você consegue assistir ao vídeo ou ler este texto.",
    "Se esse modelo/modo não estiver disponível, ou a ferramenta aceitar só texto/imagens/primeiro frame, NÃO gere. Informe qual recurso falta e as opções disponíveis. Não substitua o modelo silenciosamente e não tente recriar uma cena parecida.",
    "Use apenas a integração disponível na minha conta do aplicativo. Não configure APIs externas, não peça chaves e não inicie cobrança separada por API. Se não conseguir confirmar esse caminho, pare e explique.",
    "",
    "2. ASSOCIE OS ARQUIVOS CORRETOS",
    `Vídeo-fonte: original.mp4 (${seconds(input.metadata.duration)}, ${input.metadata.width} × ${input.metadata.height}). É a cena e a linha do tempo a editar, não uma inspiração.`,
    `Imagem do substituto: ${image}. Use somente identidade e roupa; descarte fundo, pose e enquadramento da foto.`,
    `Seleção do alvo (descrição, não detecção já executada): ${JSON.stringify(input.target)}.`,
    "Assista ao original inteiro e identifique uma única pessoa consistente. Se não conseguir distinguir o alvo, solicite a identificação antes de executar. Os demais personagens ficam intactos.",
    multiple
      ? "Este modelo exige os trechos fornecidos. Envie cada MP4 de trechos/ como VÍDEO a editar, com a mesma imagem do influencer. Não use frames isolados no lugar dos vídeos. Confira a continuidade do alvo entre trechos."
      : "Envie original.mp4 INTEIRO ao campo de vídeo da ferramenta e a imagem ao campo de referência do personagem. Não use uma captura de tela no lugar do vídeo.",
    ...timing,
    wan ? "config.json contém os parâmetros de referência do Wan; ele não aceita os prompts de texto." : "O texto em prompts/ é para o campo de edição do modelo. Não transforme o vídeo em uma nova descrição de cena, não combine todos os prompts e não acrescente linguagem cinematográfica, cenários ou gestos inventados.",
    "config.json documenta parâmetros e nomes de arquivos LOCAIS. Anexá-lo não seleciona modelo nem executa uma API; você precisa associar os arquivos reais à ferramenta.",
    "",
    "3. ENTREGUE A EDIÇÃO, COMPARADA COM O ORIGINAL",
    "Altere apenas a identidade e a roupa da pessoa-alvo, preservando seus gestos e o instante de cada ação. Preserve cenário, câmera, enquadramento, cortes, outras pessoas, objetos e textos.",
    multiple ? "Remonte os trechos nas posições indicadas. Não esconda diferenças preenchendo com vídeo original, congelando, repetindo ou inventando quadros." : "Preserve a linha do tempo inteira; não corte, repita, congele ou mude a velocidade para disfarçar diferença de duração.",
    audioInstruction,
    `Compare original e resultado nos mesmos instantes: ${checkpoints.map(seconds).join(", ")}, e assista aos dois completos. Siga CONFERIR-RESULTADO.txt.`,
    "Duração parecida e áudio correto não provam fidelidade visual. Se fachada, câmera, posição, gestos ou ordem das ações mudarem, informe que houve recriação e marque o resultado como reprovado. Não inicie outra geração automaticamente.",
    "Entregue o vídeo final e informe o modelo/modo realmente usado, os arquivos associados e as verificações feitas ou não realizadas. Não declare 'idêntico', 'Genjutsu executado' ou 'fidelidade validada' sem evidência.",
    "",
    "Este documento orienta o aplicativo externo; não instala um modelo nem garante que ele obedeça. Um prompt não transforma outro modelo no Genjutsu.",
  ]));
  entries.push(textEntry("CONFERIR-RESULTADO.txt", [
    "CRITÉRIOS DE CONFERÊNCIA — TROCA LOCALIZADA",
    `Original: ${seconds(input.metadata.duration)}; imagens: ${seconds(pictureDuration)}; ${input.metadata.width} × ${input.metadata.height}${input.metadata.frameCount ? `; ${input.metadata.frameCount} quadros` : ""}.`,
    `Compare nos instantes ${checkpoints.map(seconds).join(", ")} e durante toda a reprodução, principalmente cortes, entradas/saídas e oclusões.`,
    "[ ] Mesma pessoa substituída durante todo o vídeo; identidade/roupa coerentes com a imagem.",
    "[ ] Mesmo cenário: fachada, chão, veículos, placas, objetos e outras pessoas permanecem nas mesmas posições.",
    "[ ] Mesma câmera: distância, ângulo, enquadramento, movimento e cortes.",
    "[ ] Mesmas ações nos mesmos instantes: mãos, cabeça, caminhada, contatos e objetos manipulados. Gestos diferentes são falha mesmo se a roupa estiver correta.",
    "[ ] Linha do tempo completa, proporção preservada e continuidade entre trechos, sem cortes, loops ou quadros congelados para completar duração.",
    `[ ] ${audioInstruction}`,
    "Se houver recriação do cenário ou dos movimentos, o resultado não satisfaz a troca localizada. Relate a divergência e mantenha o original. Não consuma novos créditos sem uma nova decisão do usuário.",
    "Registre modelo/modo utilizado e limitações observadas. Uma mudança de resolução ou fps, isoladamente, não prova recriação; examine a imagem e a sincronização. Conferir apenas metadados não valida fidelidade visual.",
  ]));
  entries.unshift(textEntry("LEIA-ME.txt", [
    "TROCA DE PERSONAGEM — COMO USAR O PACOTE",
    `Referência: ${name}. Influencer: ${influencerName}.`,
    `Modelo escolhido: ${engine.label} (${engine.model}).`,
    "",
    "NO MUSE OU EM OUTRO ASSISTENTE",
    `1. Anexe original.mp4 e ${image}. Se o aplicativo aceitar ZIP, envie o pacote e peça para extrair os arquivos.`,
    "2. Cole o conteúdo de COMECE-AQUI.txt na mensagem. Ele é a instrução principal; não use apenas 'leia tudo e faça'.",
    "3. Disponibilize config.json e a pasta prompts quando solicitados. Se houver pasta trechos, disponibilize esses vídeos para as etapas de edição.",
    "O assistente precisa ter uma ferramenta de edição de vídeo compatível com o modelo escolhido. Se não tiver, deve informar a limitação antes de gerar, sem inventar uma alternativa.",
    "",
    "NO EDITOR DO MODELO, SEM ASSISTENTE",
    modelInstruction,
    ...timing,
    `Use ${image} como referência de identidade/roupa. Nunca use a foto como primeiro frame ou fundo da cena.`,
    audioInstruction,
    "Confira CONFERIR-RESULTADO.txt antes de aprovar o resultado.",
    "",
    "QUAL MODELO ESTE PACOTE USA?",
    input.engine === "higgsfield"
      ? "Este pacote está preparado para Genjutsu Object Swap. Você precisa de acesso real a esse modo na ferramenta externa. Motion Transfer tem outra finalidade."
      : "Este pacote está preparado para o modelo acima; ele NÃO executa o Genjutsu da Higgsfield. Para preparar arquivos e prompt especificamente para Genjutsu Object Swap, selecione Higgsfield · Genjutsu Object Swap no site e exporte novamente. Exportar não inicia uma geração.",
    "prompts/universal.txt é uma descrição portátil da edição; não substitui o modelo escolhido e não deve ser usado para contornar falta de uma ferramenta de edição. Não é um campo de entrada do Wan Replace.",
    "",
    "ARQUIVOS E CUSTOS",
    "original.mp4 e a imagem mantêm os bytes originais, sem recompressão pela exportação. config.json contém SHA-256 para conferência, parâmetros e caminhos LOCAIS, não URLs de API nem comandos executáveis.",
    "A exportação não inicia geração nem consome créditos de geração do sistema. O aplicativo externo aplica as condições e o saldo da sua conta. Este pacote não contém chaves e não autoriza configurar cobrança separada por API.",
    "O pacote fornece materiais e instruções; não inclui o motor proprietário do Genjutsu e não garante fidelidade de um modelo externo. Uma edição só deve ser aprovada depois da comparação visual.",
  ]));
  return entries;
}
