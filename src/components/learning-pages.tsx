import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock, Infinity, LockKeyhole } from "lucide-react";
import styles from "./learning-pages.module.css";

const modules = [
  {
    title: "Uma identidade que você consegue repetir",
    description: "Defina rosto, silhueta, roupa e intenção antes de gerar.",
    paragraphs: [
      "Um personagem reconhecível precisa de poucas decisões fortes. Comece pela silhueta, por uma combinação de cores e por um traço de personalidade. Acrescentar muitos detalhes sem prioridade pode produzir imagens visualmente interessantes, mas difíceis de repetir em outras cenas.",
      "No criador, escolha primeiro o tipo de personagem e o corpo. Depois defina cabelo, roupa e dois elementos de reconhecimento. Uma foto de identidade deve mostrar bem o rosto; uma referência de estilo deve mostrar a roupa ou a direção visual. Essas imagens têm funções diferentes. Quando gerar, compare o resultado com a ficha que você escreveu, em vez de avaliar apenas se ficou bonito.",
    ],
    checklist: ["Registre três características que precisam permanecer nas próximas cenas.", "Escolha uma imagem de referência nítida, sem rosto encoberto ou filtros fortes.", "Evite pedir acessórios que escondam justamente o rosto ou a silhueta que você precisa manter.", "Dê um nome específico ao influencer para encontrar a versão aprovada depois."],
    prompt: "IDENTIDADE\nNome: [nome]\nSilhueta: [corpo e proporções]\nReconhecimento: [cabelo, rosto e um detalhe marcante]\nRoupa-base: [peças e cores]\nPersonalidade na cena: [duas características]\nManter nas próximas versões: [três elementos prioritários]",
    exercise: "Crie uma ficha curta e selecione os traços correspondentes no criador. Antes de gerar, retire duas instruções que não contribuam para reconhecer o personagem.",
  },
  {
    title: "Uma referência melhor economiza tentativas",
    description: "Escolha a cena pelo que ela permite editar, não só pelas views.",
    paragraphs: [
      "Um vídeo popular pode ser uma referência difícil. Cortes rápidos, várias pessoas cruzando a cena, mãos sobre o rosto e movimentos fora do enquadramento dificultam acompanhar o protagonista. Para uma primeira tentativa, prefira uma ação clara e um personagem principal visível na maior parte do clipe.",
      "Assista ao vídeo do início ao fim e anote o que não pode mudar: fala, produto, gesto, câmera ou cenário. Conte quantas vezes o personagem fica escondido e quantos cortes existem. Se houver várias pessoas, descreva a posição, a roupa e a ação da pessoa que será substituída; ‘trocar o homem’ pode ser ambíguo.",
    ],
    checklist: ["Confira a duração real do arquivo e se o áudio original está presente.", "Identifique o protagonista por posição e aparência, sem descrições vagas.", "Prefira boa luz e enquadramento suficiente para ver o corpo em ação.", "Use um trecho que tenha começo e fim compreensíveis, sem cortar a fala no meio."],
    prompt: "REFERÊNCIA\nProtagonista a substituir: [pessoa, roupa e posição]\nAção principal: [o que acontece]\nElementos que devem continuar: [produto, cenário, outras pessoas]\nÁudio necessário: [fala, música, efeitos]\nPontos difíceis: [oclusões, cortes, movimento de câmera]\nObjetivo da versão: [mensagem em uma frase]",
    exercise: "Compare duas referências e escolha a mais simples de editar. Explique sua escolha usando luz, cortes, visibilidade do personagem e mensagem — não apenas o número de visualizações.",
  },
  {
    title: "Instruções claras para trocar o personagem",
    description: "Separe o alvo da edição da identidade que entra no vídeo.",
    paragraphs: [
      "A imagem do influencer define quem entra na cena. A descrição do alvo indica quem deve sair. O restante da instrução explica o que precisa ser preservado. Misturar essas funções em um texto longo pode criar conflito: pedir um cenário novo e, ao mesmo tempo, preservar integralmente o original não descreve uma única edição.",
      "Escreva a instrução em três partes: alvo, substituição e preservação. Evite acrescentar uma estética nova ao teste inicial. Primeiro avalie se o modelo manteve ação e identidade. Só depois teste mudanças adicionais, uma de cada vez. Nenhum prompt garante fidelidade perfeita; o resultado precisa de revisão visual.",
    ],
    checklist: ["Descreva uma única pessoa como alvo sempre que esse for o objetivo.", "Use a foto aprovada do influencer como identidade de substituição.", "Liste o que deve permanecer apenas quando isso for importante para a cena.", "Remova pedidos contraditórios e mudanças desnecessárias antes de enviar."],
    prompt: "Substitua [descrição inequívoca do protagonista] pelo personagem da imagem de referência. Preserve sua identidade visual, roupa e proporções reconhecíveis. Mantenha a ação, o enquadramento e o movimento de câmera do vídeo original. Preserve [cenário, produto e outras pessoas relevantes]. Não acrescente personagens ou elementos novos.",
    exercise: "Escreva sua instrução em até quatro frases. Peça a alguém para identificar o protagonista apenas pela descrição, ou confira se você mesmo consegue distingui-lo de todas as outras pessoas da cena.",
  },
  {
    title: "Revisão antes de gastar de novo",
    description: "Compare o original, o resultado e os pontos de continuidade.",
    paragraphs: [
      "Assista uma vez sem pausar para avaliar a mensagem. Depois revise em trechos curtos. Confira rosto, roupa, mãos, produto, cenário e câmera. Um único frame bonito não mostra se o vídeo se mantém coerente durante todo o movimento.",
      "Nos vídeos processados em partes, examine os pontos de união: o tamanho do corpo, a posição no quadro e as cores precisam continuar convincentes. Escute o arquivo final para confirmar o áudio. Se a geração já existe, mas a montagem falhou, use a finalização disponível na galeria antes de iniciar outra geração. Finalizar arquivos existentes e gerar novos resultados são etapas diferentes.",
    ],
    checklist: ["Compare a duração do original com a do vídeo final.", "Escute início, fim e transições; verifique se a fala está sincronizada.", "Procure mudanças repentinas de rosto, roupa, escala ou posição.", "Anote o problema concreto e altere apenas a referência, a instrução ou o modelo que possa resolvê-lo.", "Confira novamente o custo exibido antes de uma nova tentativa."],
    prompt: "REVISÃO DA VERSÃO\nDuração e áudio: [ok / observação]\nIdentidade do personagem: [ok / observação]\nAção e câmera: [ok / observação]\nProduto e cenário: [ok / observação]\nContinuidade entre trechos: [ok / observação]\nUma mudança para o próximo teste: [mudança específica]",
    exercise: "Faça uma revisão usando a ficha acima. Se a versão não funcionar, escreva uma hipótese sobre a causa antes de mudar o modelo ou gerar novamente.",
  },
  {
    title: "Transforme uma criação em uma série",
    description: "Organize versões, mensagens e formatos para publicar com consistência.",
    paragraphs: [
      "Uma série fica mais fácil quando você repete a identidade do personagem e varia uma ideia por vídeo. Defina quem assiste, qual é a mensagem principal e qual ação você espera do público. O personagem deve ajudar a contar essa mensagem, não disputar atenção com tudo o que aparece na tela.",
      "Organize os arquivos por personagem, referência e versão. Antes de publicar, confira cortes, legibilidade de textos, áudio e regras da plataforma. Revise qualquer legenda gerada automaticamente: nomes, ofertas, preços e afirmações precisam corresponder ao que você realmente quer comunicar.",
    ],
    checklist: ["Escolha uma mensagem principal para cada vídeo.", "Use nomes de arquivo que indiquem personagem, data e versão.", "Mantenha uma cópia do original e outra do resultado aprovado.", "Confira autorizações do material e a identificação de conteúdo de IA quando exigida pela plataforma.", "Compare resultados com o mesmo critério; uma publicação isolada não garante tendência."],
    prompt: "PAUTA DA SÉRIE\nPersonagem: [nome]\nPúblico: [para quem]\nTema recorrente: [assunto]\nEpisódio 1 — mensagem: [uma frase]\nEpisódio 2 — mensagem: [uma frase]\nEpisódio 3 — mensagem: [uma frase]\nO que se repete: [identidade e formato]\nO que muda: [uma variável por episódio]",
    exercise: "Planeje três episódios com o mesmo influencer. Reutilize a identidade aprovada e varie apenas a mensagem principal de cada referência.",
  },
];

export function LessonLibrary({ unlocked }: { unlocked: boolean }) {
  return <div className={styles.page}>
    <header className={styles.hero}><div><span className={styles.badge}><BookOpen size={14} /> PRO E MAX</span><h1>Módulos para criar melhor</h1><p>Guias práticos e exercícios originais para usar o estúdio com mais intenção, do personagem à revisão final.</p></div><Link href="/app/influencers" className="btn btn-ghost">Abrir criador <ArrowRight size={16} /></Link></header>
    <div className={styles.intro}><BookOpen size={18} /><p>Aplique os guias escritos agora. A trilha extra sobre ComfyUI e GPU está em preparação.</p></div>
    {!unlocked ? <><section className={styles.locked}><LockKeyhole size={24} /><h2>Continue aprendendo no Pro ou Max</h2><p>Os módulos completos estão incluídos nesses planos. Veja abaixo os assuntos e escolha seu plano para acessar os guias e exercícios.</p><Link href="/app/planos" className="btn btn-accent">Ver planos <ArrowRight size={16} /></Link></section><div className={styles.previewGrid}>{modules.map((module, index) => <article key={module.title}><span className={styles.number}>0{index + 1}</span><h2>{module.title}</h2><p>{module.description}</p></article>)}</div></> : <div className={styles.modules}>{modules.map((module, index) => <details key={module.title} className={styles.module} open={index === 0}><summary><span className={styles.number}>0{index + 1}</span><div><h2>{module.title}</h2><p>{module.description}</p></div><ChevronDown size={18} /></summary><div className={styles.body}>{module.paragraphs.map((text) => <p key={text}>{text}</p>)}<h3>Antes de seguir</h3><ul>{module.checklist.map((text) => <li key={text}>{text}</li>)}</ul><h3>Modelo para adaptar</h3><pre>{module.prompt}</pre><div className={styles.exercise}><strong>Seu exercício</strong>{module.exercise}</div></div></details>)}</div>}
    <section className={styles.extraModule} aria-labelledby="extra-unlimited-title">
      <div>
        <div className={styles.extraBadges}><span className={styles.badge}>MÓDULO EXTRA · MAX</span><span className={`${styles.badge} ${styles.preparation}`}><Clock size={13} aria-hidden="true" />Em preparação</span></div>
        <h2 id="extra-unlimited-title"><Infinity size={22} aria-hidden="true" />Criação Ilimitada</h2>
        <p>Uma futura trilha sobre produção com ComfyUI e GPU própria ou alugada. As aulas gravadas ainda não estão disponíveis; o acesso ao módulo faz parte do plano Max.</p>
      </div>
      <Link href="/app/criacao-ilimitada" className="btn btn-ghost" aria-label="Conhecer o módulo Criação Ilimitada">Conhecer o módulo <ArrowRight size={16} aria-hidden="true" /></Link>
    </section>
  </div>;
}

export function UnlimitedLearning({ unlocked }: { unlocked: boolean }) {
  return <div className={styles.page}>
    <Link href="/app/modulos" className={`btn btn-ghost ${styles.backLink}`}><ArrowLeft size={16} aria-hidden="true" />Voltar aos módulos</Link>
    <header className={styles.hero}><div><span className={styles.badge}><Infinity size={15} /> MÓDULO MAX · EM PREPARAÇÃO</span><h1>Criação Ilimitada</h1><p>Uma futura trilha para entender a produção com ComfyUI e GPU própria ou alugada. Mais autonomia para montar seu processo, com custos e limites claros.</p></div></header>
    <div className={styles.intro}><Clock size={19} /><p><strong>As aulas gravadas ainda não estão disponíveis.</strong> Não há data anunciada. O plano Max dá acesso a este módulo; o nome não inclui geração infinita no estúdio nem GPU gratuita.</p></div>
    {!unlocked ? <section className={styles.locked}><LockKeyhole size={24} /><h2>Um módulo extra do plano Max</h2><p>Conheça o conteúdo planejado abaixo. Os módulos escritos do Pro já estão disponíveis; esta trilha de aulas gravadas está em preparação.</p><Link href="/app/planos" className="btn btn-accent">Conhecer o Max <ArrowRight size={16} /></Link></section> : <div className={styles.intro}><Check size={19} /><p>Seu acesso inclui este módulo. Enquanto as aulas são preparadas, use os módulos escritos e organize as referências do seu projeto.</p></div>}
    <div className={styles.roadmap}>{[
      ["Entender o fluxo", "O papel dos modelos, referências e etapas de um workflow visual no ComfyUI."],
      ["Preparar o ambiente", "Conceitos de GPU, memória, armazenamento e configuração antes de iniciar uma sessão."],
      ["Trabalhar com referências", "Organização de imagens, vídeos, prompts e versões para experimentos reproduzíveis."],
      ["Revisar e controlar custos", "Como planejar testes, comparar resultados e acompanhar recursos do ambiente escolhido."],
    ].map(([title, description], index) => <article key={title}><span>0{index + 1} · CONTEÚDO PLANEJADO</span><h2>{title}</h2><p>{description}</p></article>)}</div>
    {unlocked ? <section className={styles.ready}><h2>O que você pode preparar agora</h2><ul>{["Salve o vídeo original, a imagem aprovada do influencer e a ficha do personagem.", "Defina o resultado esperado e um limite de gasto para cada experimento.", "Confira os requisitos do modelo e as regras de cobrança antes de contratar uma GPU.", "Organize uma pasta para entrada, versões de teste e resultados aprovados.", "Use Exportar pacote em Criar Vídeos para reunir os arquivos e instruções do projeto."].map((text) => <li key={text}><Check size={16} />{text}</li>)}</ul><div className={styles.links}><Link href="/app/criar-videos" className="btn btn-accent">Preparar meu projeto <ArrowRight size={16} /></Link><Link href="/app/modulos" className="btn btn-ghost">Ler os módulos <BookOpen size={16} /></Link></div></section> : null}
  </div>;
}
