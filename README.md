# Máquina de Influencers

> Fábrica de criadores virtuais no estilo [Higgsfield AI Influencer Studio](https://higgsfield.ai/ai-influencer-studio),
> construída sobre a arquitetura open-source do [open-higgsfield](https://github.com/wide-trace/open-higgsfield).

Crie influencers de IA com rosto, corpo e estilo sob medida, aplique movimentos
virais (Genjutsu motion transfer) e duplique tendências do TikTok/Instagram com
o seu personagem como protagonista.

## O que tem dentro

| Área | O que faz |
| --- | --- |
| **Landing page** | Visual Higgsfield: fundo quase preto, acento lima `#d1fe17`, Space Grotesk |
| **Login / Cadastro** | Conta com e-mail e senha (scrypt + cookie HMAC httpOnly), 10.000 créditos iniciais |
| **Início** | Dashboard com créditos, contadores e atalhos |
| **Vídeos Virais** | Tendências com milhões de views; prompt de duplicação pronto, escolha o influencer e gere |
| **Influencers** | Clone do AI Influencer Studio: 9 tipos de personagem, 18 grupos de traços (150+ opções), dado de sorteio, galeria Explorar com presets oficiais e botão Recriar, aba Movimento com presets Genjutsu |
| **Vídeos** | Galeria das gerações com polling automático, filtros, download e exclusão |

## Rodando

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Sem chave de API o app roda em **modo demonstração**: as gerações resolvem em
segundos com resultados de exemplo (presets oficiais), então dá para navegar o
produto inteiro.

### Gerar de verdade

Copie `.env.example` para `.env.local` e preencha:

```bash
HF_API_KEY=id:secret                           # chave da Higgsfield Platform API
HF_API_BASE_URL=https://platform.higgsfield.ai # origem da Platform API
```

A integração usa a mesma API do open-higgsfield:

- **Character sheet** → `higgsfield-ai/soul/v2/standard` (batch 4, 3:4) com o
  brief montado a partir dos traços escolhidos (mesmo formato dos presets
  oficiais do estúdio).
- **Movimento (Genjutsu)** → `kling-video/v3/motion-control/std` com
  `image_url` (seu influencer) + `video_url` (driving video do preset).
- **Viral** → `kling-video/v3.0/std/image-to-video` com o prompt de duplicação.
- Submit é `POST /{model}`, status é `GET /requests/{id}/status`, auth é
  `Authorization: Key id:secret`. Polling a cada 4s até status terminal.

## Arquitetura

```
src/
  app/
    page.tsx              landing
    login/                login + cadastro (server actions)
    app/                  shell autenticado (sidebar)
      page.tsx            início
      virais/             vídeos virais
      influencers/        estúdio (criar + movimento + explorar + histórico)
      videos/             galeria
    actions/              server actions (auth, influencers, vídeos)
  components/             client components (estúdio, grids, galeria)
  data/                   catálogos: tipos, traços, presets, efeitos virais
  lib/                    db (JSON), auth, cliente da plataforma, prompts
data/db.json              banco local (criado em runtime, fora do git)
```

- **Banco**: arquivo JSON com escrita atômica — zero dependências, ideal para
  rodar local ou num VPS pequeno. Troque por Postgres/SQLite quando escalar.
- **Créditos**: ficha de personagem ✦ 125, vídeo ✦ 1000 (ajuste em
  `src/lib/costs.ts`; créditos iniciais em `INITIAL_CREDITS`).
- **Catálogo é a fonte da verdade**: tipos, traços e presets vivem em
  `src/data/` com os mesmos ids da API da Higgsfield, então o brief gerado é
  compatível com os presets oficiais.

## Stack

Next.js 16 App Router · React 19 · CSS puro (design system próprio) · Zustand-free
(estado local por página) · lucide-react.
