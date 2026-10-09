# Máquina de Influencers

> Fábrica de criadores virtuais no estilo [Higgsfield AI Influencer Studio](https://higgsfield.ai/ai-influencer-studio),
> construída sobre a arquitetura open-source do [open-higgsfield](https://github.com/wide-trace/open-higgsfield).

A esteira completa dentro de um sistema só:

**minera o viral → cria o influencer → gera o vídeo → publica**

## O que tem dentro

| Área | O que faz |
| --- | --- |
| **Landing page** | Visual Higgsfield: fundo quase preto, acento lima `#d1fe17`, Space Grotesk |
| **Login / Cadastro** | Conta com e-mail e senha (scrypt + cookie HMAC httpOnly), 10.000 créditos iniciais |
| **Início** | Esteira dos 4 passos, créditos, contadores e atalhos |
| **Vídeos Virais** | **Mineração real do TikTok**: feed de tendências por região (BR/US/ES/JP) com views, likes, música e download sem marca d'água; import por link do TikTok ou .mp4 direto; galeria curada de efeitos virais; duplicação em um clique |
| **Influencers** | Clone do AI Influencer Studio: 9 tipos de personagem, 18 grupos de traços (150+ opções), dado de sorteio, galeria Explorar com presets oficiais e botão Recriar, aba Movimento com presets Genjutsu |
| **Vídeos** | Galeria das gerações com polling automático, filtros, download e botão Publicar |
| **Publicar** | Conexão de contas (TikTok OAuth oficial / Instagram Graph API), fila de publicação com agendamento, agendador rodando no servidor |

## Produção

**No ar:** https://maquina-de-influencers.vercel.app

O deploy na Vercel clona este repositório (público) durante o build. Para atualizar:
faça push na main e dispare um novo deploy. Atenção: na Vercel o banco JSON vive
em /tmp (efêmero) — contas e gerações podem resetar entre instâncias/deploys.
Para persistência real, troque por Postgres/Supabase.

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
| `PUBLIC_BASE_URL` | URL pública do app (necessária para o OAuth do TikTok) |
| Instagram | Sem .env: cole o IG User ID + access token do Graph API (escopo `instagram_content_publish`) na página Publicar |

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

- TikTok: feed de tendências por região e resolução de URL via API pública do
  tikwm.com (sem chave). Cache de 30min no banco; botão "Minerar agora" força.
- Instagram: a Meta não expõe feed de tendências nem o arquivo do Reel
  publicamente — importe pela URL direta do vídeo (.mp4) ou use as tendências
  do TikTok.
- O servidor também minera sozinho (região BR) a cada 30min via
  `instrumentation.ts`.

### Publicação

- Fila processada pelo agendador do servidor (60s) e pelo polling da página.
- TikTok: `POST /v2/post/publish/video/init/` com `PULL_FROM_URL` (o TikTok
  baixa o vídeo da URL de resultado da geração). Publicação entra como
  `SELF_ONLY` (padrão de app em sandbox).
- Instagram: container `REELS` → poll de processamento → `media_publish`.
- Conta sem credenciais = modo demo: a publicação é simulada e marcada com uma
  URL fictícia.

## Arquitetura

```
src/
  app/
    page.tsx                landing
    login/                  login + cadastro
    app/                    shell autenticado (sidebar)
      virais/               mineração + efeitos + duplicação
      influencers/          estúdio (criar + movimento + explorar + histórico)
      videos/               galeria
      publicar/             contas + fila de publicação
    actions/                server actions (auth, influencers, vídeos, virais, posts)
    api/oauth/tiktok/       callback do OAuth do TikTok
  components/               client components
  data/                     catálogos (tipos, traços, presets, efeitos)
  lib/                      db (JSON), auth, platform, miner, social, publisher
  instrumentation.ts        loops de fundo: agendador (60s) + mineração (30min)
data/db.json                banco local (criado em runtime, fora do git)
```

- **Banco**: arquivo JSON com escrita atômica — zero dependências. Troque por
  Postgres/SQLite quando escalar.
- **Créditos**: ficha ✦ 125, vídeo ✦ 1000 (`src/lib/costs.ts`).
- **Catálogo é a fonte da verdade**: ids idênticos aos da API da Higgsfield.

## Stack

Next.js 16 App Router · React 19 · CSS puro (design system próprio) · lucide-react.
