# Máquina de Influencers

> Fábrica de criadores virtuais no estilo [Higgsfield AI Influencer Studio](https://higgsfield.ai/ai-influencer-studio),
> construída sobre a arquitetura open-source do [open-higgsfield](https://github.com/wide-trace/open-higgsfield).

A esteira completa dentro de um sistema só:

**minera o viral → cria o influencer → gera o vídeo → publica**

## O que tem dentro

| Área | O que faz |
| --- | --- |
| **Landing page** | Templates virais próprios, carrossel de destaque, menu e modal de planos; tema claro por padrão com alternância para o escuro |
| **Login / Cadastro** | Conta com e-mail e senha (scrypt + cookie HMAC httpOnly) ou Login com Google (OpenID Connect; vincula a conta existente com o mesmo e-mail ou cria uma conta sem senha), saldo inicial configurado no servidor (padrão zero) |
| **Início** | Estúdio de criação com trabalhos recentes, elenco de influencers, créditos e o próximo passo do funil |
| **Explorar virais** | Coleta contínua (TikTok, Instagram e YouTube, cada fonte com sua trava) em três áreas: Vídeos, Descobrir personagens IA e Efeitos virais; import por link do TikTok ou .mp4 direto; duplicação em um clique |
| **Influencers** | Criação em quatro etapas (assistente), 9 tipos de personagem, 18 grupos de traços (150+ opções), dado de sorteio, galeria Explorar com presets oficiais e botão Recriar, aba Movimento com presets Genjutsu |
| **Criar vídeos** | Estúdio de geração com referência de template, perfil ou viral |
| **Meus vídeos** | Biblioteca das gerações com polling automático, filtros, visualização em modal, download e botão Publicar |
| **Aprender** | Módulos com página própria em `/app/modulos/[slug]` |
| **Publicar** | Conexão de contas (TikTok OAuth oficial / Instagram Graph API), fila de publicação com agendamento, agendador rodando no servidor |

## Produção

**No ar:** https://maquina-de-influencers.vercel.app

O deploy na Vercel clona este repositório (público) durante o build. Para atualizar:
faça push na main e dispare um novo deploy. Atenção: na Vercel o banco JSON vive
em /tmp (efêmero) — contas e gerações podem resetar entre instâncias/deploys.
Para persistência real, troque por Postgres/Supabase. O Web Analytics da Vercel
está ativo (`@vercel/analytics`, no layout raiz).

## Tema

- Tema claro como padrão (creme `#fafaf7`, branco e quase preto `#0f0f12`),
  com modo escuro opcional. Os tokens ficam em `src/app/globals.css`
  (`:root[data-theme="light"]` e `:root`), e o tema é aplicado antes da
  primeira pintura por um script em `next/script`, sem flash.
- Acento lima `--accent` (`#dbf902`) e destaque rosa `--highlight` nas palavras
  em evidência e rótulos. Botões em pílula: `.btn-accent` preto no claro e lima
  no escuro.
- Tipografia: Bricolage Grotesque (`--font-display`) nos títulos e Geist
  (`--font-ui`) na interface; títulos sem caixa alta.
- Telas do app: `src/app/app/app-theme.css` e `src/app/app/home.module.css`;
  sidebar em card flutuante com o botão "Criar vídeo" no topo e, no celular,
  menu em gaveta.

## Funil

1. A landing leva o template escolhido (`?template=slug`) e o plano
   (`?plano=X`) até o login/cadastro, que os repassam em campos ocultos e mostram
   o cartão "Você escolheu" com a capa do template.
2. Depois de entrar, quem ainda não tem plano igual ou superior vai para
   `/app/planos?plano=X&template=slug`; quem já tem pula o checkout e cai em
   `/app/criar-videos?template=slug`, com o template como referência do vídeo.
3. Sem influencer criado, a tela de Influencers avisa do template pendente; o
   Início mostra o próximo passo.

## Rodando

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

A criação de influencers exige a API da Higgsfield configurada no servidor.
Sem a chave, o formulário informa a indisponibilidade e não cobra créditos nem
substitui a geração por um preset. Fotos de identidade e estilo exigem também
`BLOB_READ_WRITE_TOKEN` para disponibilizar as referências ao provedor.

## Ligando as integrações reais

Copie `.env.example` para `.env.local`:

| Variável | Para quê |
| --- | --- |
| `HF_API_KEY` (`id:secret`) + `HF_API_BASE_URL` | Geração real (Higgsfield Platform API) |
| `BLOB_READ_WRITE_TOKEN` | Armazenamento das fotos de identidade e estilo antes da geração |
| `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` | Publicação real no TikTok (Content Posting API via OAuth; callback em `/api/oauth/tiktok/callback`) |
| `INSTAGRAM_APP_ID` + `INSTAGRAM_APP_SECRET` | Credenciais próprias do produto Instagram Login; callback em `/api/oauth/instagram/callback` |
| `SOCIAL_TOKEN_SECRET` | Chave AES-256 de 32 bytes (base64 ou 64hex) estável para cifrar tokens sociais no banco |
| `PUBLIC_BASE_URL` | Origem HTTPS pública e fixa usada nos callbacks OAuth |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Login com Google (OpenID Connect, credencial "Aplicativo da Web"); redirect exato em `PUBLIC_BASE_URL/api/auth/google/callback`. Sem o par, o botão avisa que o login está indisponível |
| `TIKTOK_VERIFIED_MEDIA_PREFIXES` | Prefixos HTTPS do armazenamento verificados no painel TikTok, separados por vírgula |
| `CRON_SECRET` + `PUBLICATION_CRON_CONFIGURED` | Autenticação do cron e confirmação de que o agendador foi ativado no ambiente |

### Mapeamento de geração (mesma API do open-higgsfield)

- **Character sheet** → `higgsfield/ai-influencer` (uma imagem 2K, 16:9), com
  `tier`, `selection`, `seed`, `brief`, `image_url` para identidade e
  `item_image_urls` para estilo. Os pedidos usam `Idempotency-Key`; falhas
  confirmadas devolvem os créditos do sistema uma única vez. Pedidos de
  resultado incerto não são reenviados automaticamente.
- **Catálogo de aparência** → 18 grupos e 182 opções da API oficial, com 148
  imagens locais. `npm run validate:traits` verifica hashes e arquivos sem rede;
  `node scripts/sync-influencer-traits.mjs --discover` atualiza a cópia do catálogo público.
- **Duplicação de viral / Movimento** → `kling-video/v3/motion-control/std`
  com `image_url` (influencer) + `video_url` (vídeo minerado ou driving video
  do preset Genjutsu).
- **Efeitos virais** → `kling-video/v3.0/std/image-to-video` com prompt de
  duplicação.
- Submit `POST /{model}` · status `GET /requests/{id}/status` · auth
  `Authorization: Key id:secret` · polling 4s até status terminal.

### Mineração

- **Desligada por padrão**: a coleta automática só roda com
  `VIRAL_COLLECTION_ENABLED=true`. Sem isso, o cron pode estar declarado e
  disparar que a rodada encerra em `runViralCollection` sem consultar nenhum
  provedor, sem lease e sem gravar estado; o agendador local nem é registrado
  e a página nunca dispara a rodada de segurança. Um deploy de outra alteração
  não liga a coleta. A busca manual do usuário ("Buscar no TikTok agora" e
  "Importar link") continua sendo uma ação explícita, independente da trava.
- Coleta contínua (`src/lib/viral-collector.ts`): o cron `/api/cron/virals`
  roda a cada 15 min (vercel.json, autenticado por `CRON_SECRET`), com lease
  contra execuções sobrepostas, cursores persistidos, espera progressiva quando
  o provedor bloqueia e estado por fonte (última tentativa, último sucesso,
  novos itens) em `mi_settings`. Fora da Vercel, `instrumentation.ts` chama
  a mesma rotina no mesmo intervalo. Visitas à página não disparam coleta
  externa; só uma rodada curta de segurança quando o agendador está parado
  há mais de dois intervalos.
- TikTok: busca por nomes dos personagens e termos de influencers virtuais via
  API pública do tikwm.com (serviço de terceiros, sem chave, com limite de
  consultas e bloqueios eventuais; não é uma API oficial do TikTok). As
  métricas dos vídeos descobertos nos últimos 14 dias são renovadas aos poucos;
  três falhas seguidas marcam o vídeo como indisponível, sem apagá-lo.
- Instagram (`src/lib/instagram-discovery.ts`): tentativa pela API oficial
  (aresta `business_discovery`) com a conexão já existente da conta
  administradora (Instagram API with Instagram Login). Resultado real em
  2026-10-20: a Meta respondeu "Tried accessing nonexisting field
  (business_discovery)" para todos os perfis; essa aresta só existe na
  Instagram API with Facebook Login (conta profissional ligada a uma Página do
  Facebook, escopos `instagram_basic`, `instagram_manage_insights`,
  `pages_read_engagement`). Até existir essa outra conexão, o Instagram fica
  em modo catálogo (acervo verificado + importação manual) e a página não
  anuncia atualização automática. A página também não mostra mais o status por
  fonte nem o aviso de coleta desligada.
- TikTok: a busca via tikwm fica desligada por padrão
  (`TIKTOK_DISCOVERY_ENABLED=true` liga) porque a fonte respondeu HTTP 403 em
  2026-10-20; a página mostra o motivo e não repete consultas bloqueadas.
- Cada vídeo guarda data de descoberta, data de publicação (quando a fonte
  informa) e data da última atualização de métricas; o indicador "novo"
  compara a descoberta com a última visita do usuário.
- YouTube (complemento, desligado por padrão): descoberta pela API oficial
  (YouTube Data API v3) só com `YOUTUBE_API_KEY` e
  `YOUTUBE_DISCOVERY_ENABLED=true`; busca Shorts recentes por termos de
  personagens de IA, uma rodada por hora com duas buscas. Cota oficial
  (documentação consultada em 2026-10-20): 100 chamadas `search.list` por dia
  em bucket próprio e 10.000 unidades/dia para os demais métodos, reinício à
  meia-noite no horário do Pacífico, HTTP 403 `quotaExceeded` ao estourar; o
  coletor usa 48 buscas + 48 `videos.list` por dia e, ao estourar, espera a
  virada do dia.
  Não há arquivo de vídeo: a reprodução usa o player oficial (embed) e o vídeo
  não serve como referência de movimento. Sem chave, a fonte aparece como
  "integração pronta, aguardando chave".
- A página Explorar virais tem três áreas sobre o mesmo acervo, sem repetir
  consultas externas: **Vídeos** (tudo o que foi coletado + catálogo),
  **Descobrir personagens IA** (agrupado por perfil: acompanhados, novos
  perfis com evidência da fonte e candidatos para revisar; nunca por
  aparência) e **Efeitos virais** (presets executáveis do catálogo local, com
  prompt/modelo/custo validados, separados das tendências descobertas, que são
  só inspiração). O catálogo de efeitos não tem métricas de alcance; os
  números ilustrativos antigos foram removidos. Critério de "tendência
  descoberta": vídeo da coleta cujo título, legenda ou música cita um efeito
  do catálogo (nome ou tag específica) ou vocabulário de efeito visual
  (`EFFECT_VOCABULARY` em `src/lib/effects-catalog.ts`). Em "Descobrir
  personagens", só perfis acompanhados são verificados; termos de IA no nome
  ou no título são indícios e o perfil fica marcado como não verificado.
- Fontes de descoberta para Instagram e TikTok: avaliação e proposta em
  `docs/fontes-virais-proposta.md` (nenhum provedor contratado).

### Publicação

- Instagram Login solicita apenas `instagram_business_basic` e
  `instagram_business_content_publish`. Exige conta Criador/Empresa; o ID
  do produto Instagram é diferente do ID do aplicativo Facebook. A conexão
  usa nonce assinado, cookie httpOnly de dez minutos e a sessão autenticada.
- Tokens e refresh tokens ficam cifrados com AES-256-GCM, vinculados ao usuário
  e à rede. São renovados no servidor quando necessário; autorizações vencidas
  ou revogadas exigem reconexão. Tokens antigos em texto puro exigem reconexão.
- Instagram: cria container `REELS`, espera `FINISHED` e chama `media_publish`.
  TikTok: consulta `creator_info`, usa visibilidade/interações escolhidas pelo
  usuário, confirma os limites de duração e envia via `PULL_FROM_URL` com o
  rótulo de conteúdo gerado com IA e as divulgações comerciais selecionadas.
- A fila usa leases e comparação de revisão no banco. Cada ação tem chave de
  idempotência; cancelar preserva o registro dessa chave. Antes de um envio há
  um checkpoint persistente. Se uma resposta se perde, o sistema consulta o
  pedido conhecido ou exige conferência manual; nunca repete um envio incerto.
- `vercel.json` agenda `/api/cron/publish` a cada minuto com `CRON_SECRET`.
  Esse intervalo depende do plano Vercel. Defina `PUBLICATION_CRON_CONFIGURED=true`
  apenas depois de confirmar a ativação do cron; sem ele, o processamento
  depende da página aberta (ou do processo local). Rascunhos nunca são enviados.
- Sem credenciais, a conexão fica indisponível. Nenhuma conta ou publicação
  fictícia é criada. Registros demo anteriores não viram publicações reais.

#### Ativação externa necessária

1. Instagram: configurar o callback exato no produto Instagram Login e as duas
   permissões acima. Adicionar/autorizar a conta profissional de teste enquanto
   o app estiver em desenvolvimento. Para contas externas, concluir App Review
   e publicar o aplicativo conforme os requisitos mostrados pela Meta.
2. TikTok: configurar Login Kit/Content Posting API e o callback, verificar a
   propriedade dos prefixos dos vídeos e concluir a auditoria de Direct Post.
   Sem auditoria, o TikTok limita envios a contas privadas com `SELF_ONLY`.
   Ferramentas exclusivas para contas internas não atendem o uso amplo exigido
   pela auditoria. A configuração não garante aprovação da plataforma.
3. Configurar os segredos somente no servidor, ativar o cron e executar um
   teste de publicação apenas com autorização explícita do proprietário.

Fontes: [Meta, Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/),
[coleção oficial Meta](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api),
[TikTok, Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post),
[TikTok, requisitos de interface](https://developers.tiktok.com/docs/en/content-sharing-guidelines).
O fluxo editorial segue o modo de poster próprio da
[skill instagram-marketing](https://github.com/sergebulaev/instagram-skills/blob/main/SKILL.md):
preparar, revisar e só então enviar a mídia autorizada.

## Arquitetura

```
src/
  app/
    page.tsx                landing
    v/                      páginas públicas dos templates virais
    login/                  login + cadastro (e-mail/senha e Google)
    app/                    shell autenticado (sidebar, gaveta no celular, esqueleto de carregamento)
      virais/               coleta + personagens + efeitos + duplicação
      influencers/          estúdio (assistente em 4 etapas + movimento + explorar + histórico)
      criar-videos/         estúdio de geração
      videos/               biblioteca
      modulos/[slug]/       páginas dos módulos de aprendizado
      publicar/             contas + fila de publicação
    actions/                server actions (auth, influencers, vídeos, virais, posts)
    api/auth/google/        início e callback do Login com Google
    api/cron/               cron de publicação e de coleta de virais
    api/oauth/tiktok/       callback do OAuth do TikTok
  components/               client components
  data/                     catálogos (tipos, traços, presets, efeitos)
  lib/                      db (JSON), auth, platform, miner, social, publisher
  instrumentation.ts        loops de fundo: agendador (60s) + mineração (30min)
data/db.json                banco local (criado em runtime, fora do git)
```

- **Banco**: arquivo JSON com escrita atômica — zero dependências. Troque por
  Postgres/SQLite quando escalar.
- **Créditos**: 10 créditos = US$1; personagem ✦ 1, efeito de 5s ✦ 7, edição conforme orçamento assinado (`src/lib/credit-pricing.ts`, `src/lib/costs.ts`). Recargas avulsas em `/app/creditos`, via PIX com cotação PTAX; [operação e ativação](docs/mvp-operations.md).
- **Catálogo é a fonte da verdade**: ids idênticos aos da API da Higgsfield.

## Stack

Next.js 16 App Router · React 19 · CSS puro (design system próprio) · lucide-react.
