# Fontes de descoberta para Instagram e TikTok — avaliação e proposta

Data da pesquisa: 2026-10-20. Nenhum provedor foi contratado, nenhuma cobrança
foi ativada. Os preços abaixo são os publicados pelos próprios provedores na
data (páginas oficiais, salvo indicação); confirmar na página de preços antes
de contratar.

## Situação atual

| Fonte | Hoje | Problema |
| --- | --- | --- |
| TikTok | tikwm.com (API pública de terceiro, sem chave) | Respondeu **HTTP 403** a toda busca automatizada a partir desta máquina em 2026-10-20 (reteste no mesmo dia: 403). Sem SLA, sem contrato, sem garantia. |
| Instagram | Catálogo verificado (`src/data/ai-profiles.ts`) + importação manual de Reels dos perfis acompanhados | Não existe descoberta automática. |
| YouTube | API oficial (Data API v3), complemento desligado por padrão | Não cobre o objetivo principal. |

## Caminhos oficiais (e por que não bastam)

- **Instagram Graph API — Hashtag Search** (Meta): exige conta Business/Creator
  conectada a uma Página do Facebook, App Review com a feature *Instagram Public
  Content Access* e `instagram_basic`. Limites publicados: **30 hashtags únicas
  por conta a cada 7 dias**; `recent_media` devolve só mídia das **últimas 24 h**;
  `username` do autor **não é retornado**; `media_url` pode faltar em Reels.
  Serve para acompanhar hashtags (ex.: `#aiinfluencer`), não para descobrir
  perfis novos nem buscar por nome. Custo: zero, mas depende de aprovação da Meta.
- **TikTok Research API**: a FAQ oficial responde **"No"** para criadores,
  anunciantes e usuários comerciais; só instituições acadêmicas e algumas ONGs em
  regiões específicas. Fora de alcance para este produto.
- **TikTok Display API**: só devolve o conteúdo do próprio usuário autenticado;
  não há busca pública.

Conclusão: para descoberta automática de perfis e vídeos no Instagram e no TikTok
é preciso um provedor de dados de terceiros (acesso a conteúdo público). Esses
serviços não são APIs oficiais; a responsabilidade de uso é contratual com o
provedor e deve respeitar os termos das plataformas (só conteúdo público, sem
contornar login).

## Provedores avaliados

| Provedor | Cobertura relevante | Limites / modelo | Custo publicado | Observações |
| --- | --- | --- | --- | --- |
| **EnsembleData** (ensembledata.com/pricing) | TikTok: busca por palavra-chave e por hashtag (1 unidade = ~20 posts); perfil (posts de usuário); Instagram: busca por palavra-chave (1 unidade = 20 posts), hashtag e posts de usuário (unidades por post) | Unidades diárias por plano, reinício 00:00 UTC; falhas internas não cobram; trial 50 unidades/dia sem cartão | Trial US$ 0 · Wood US$ 100/mês (1.500 un./dia) · Bronze US$ 200/mês (5.000 un./dia) | API única para as duas redes; unidades diárias (uso constante como o nosso cabe bem). Metadados completos (views, likes, autor, data de publicação). |
| **ScrapeCreators** | TikTok: busca de vídeos por palavra-chave, perfil; Instagram: perfil/posts (busca por hashtag/keyword não confirmada na pesquisa) | Créditos pré-pagos, não expiram; 1 crédito por chamada na maioria das rotas; cache não cobra | US$ 47 / 25.000 créditos (~US$ 1,88 por mil); US$ 497 / 500.000 (fonte: comparativos de terceiros; página oficial de preços não respondeu em 2026-10-20) | Mais barato para volume baixo; precisa confirmar as rotas de busca do Instagram na documentação oficial antes de decidir. |
| **Apify — clockworks/tiktok-scraper** (apify.com) | TikTok: hashtags, palavras-chave (vídeos e perfis), perfis | Pagamento por resultado; sem cobrança de plataforma; add-ons (download de vídeo, filtros de data) à parte; 99,1% de execuções com sucesso | A partir de US$ 1,70 por 1.000 resultados (plano Business; planos menores pagam mais: guia de terceiros cita US$ 3,70 no Free) | Bom para TikTok; cada rede é um ator diferente, com preço e manutenção próprios. |
| **Apify — apify/instagram-scraper** | Instagram: perfis, posts, Reels, hashtags, busca (hashtag/lugar/usuário) | Pagamento por resultado; sem login; "sem teto fixo" de resultados | US$ 2,70/1.000 (Free) · US$ 2,30 (Starter) · US$ 1,90 (Scale) · US$ 1,50 (Business) | Cobre hashtag e Reels; busca por palavra-chave limitada a hashtag/lugar/usuário. |
| **Bright Data — Instagram Scraper API** | Instagram: perfis, posts, Reels por URL; hashtag é produto separado; sem busca por palavra-chave | 5.000 registros/mês grátis; pay-as-you-go US$ 1,50/1.000; Scale US$ 499/mês (384.000 registros); entrega por webhook/arquivo (assíncrona) | US$ 1,50 por 1.000 registros | Orientado a lotes por URL; menos adequado a descoberta contínua por termo. |
| **Data365** | Instagram: posts por hashtag/localização/perfil (até 2.000 por busca); TikTok: busca de posts (até 300 por busca), perfis (até 400 por busca) | Créditos mensais (Basic 500 mil, Standard 1 mi); trial 14 dias | Preço não publicado (contato comercial) | Só com cotação. |

## Estimativa de consumo do nosso coletor

Rodada a cada 15 min, com as consultas atuais (`AI_DISCOVERY_QUERIES`: 5 perfis
+ 2 aliases + 3 termos = 10 consultas por rodada no TikTok) e, para Instagram,
5 perfis acompanhados + 3 hashtags/termos = 8 consultas por rodada. Com a
renovação de métricas (até 6 vídeos por rodada), aproximadamente:

| Cadência | Consultas/dia (TikTok + Instagram + métricas) | EnsembleData (1 un./consulta, 20 posts) | ScrapeCreators (1 crédito/chamada) | Apify (resultados ≈ 20 por consulta) |
| --- | --- | --- | --- | --- |
| 15 min (96 rodadas) | ~2.300 | Bronze (5.000 un./dia): US$ 200/mês | ~70.000 créditos/mês ≈ US$ 70–130/mês | ~46.000 resultados/dia → US$ 70–125/dia: inviável |
| 1 h (24 rodadas) | ~580 | Wood (1.500 un./dia): US$ 100/mês | ~17.500 créditos/mês ≈ US$ 33/mês | ~11.600 resultados/dia → US$ 17–31/dia |
| 4 h (6 rodadas) | ~150 | Trial (50 un./dia) não basta; Wood: US$ 100/mês | ~4.400 créditos/mês ≈ US$ 8/mês | ~2.900 resultados/dia → US$ 4–8/dia |

Os números do Apify assumem cobrança por resultado devolvido; cobrar por
resultado penaliza buscas amplas, por isso é a pior opção para coleta contínua.

## Recomendação

1. **Provedor único para as duas redes: EnsembleData, plano Wood (US$ 100/mês)**,
   com o coletor em cadência de 1 h (não 15 min) enquanto a demanda real não
   justificar o Bronze. Motivos: cobre busca por palavra-chave e hashtag no
   TikTok e no Instagram com a mesma API, cobra por chamada (não por resultado),
   tem trial sem cartão para validar antes de pagar e devolve autor, data de
   publicação e métricas, que a página já sabe exibir.
   - Antes de contratar: usar o **trial (50 unidades/dia, sem cartão)** por um
     dia para demonstrar a entrada de um perfil novo real nas duas redes e
     conferir os campos devolvidos. Isso ainda exige a sua aprovação, porque cria
     conta em serviço externo (mesmo sem cobrança).
2. **Alternativa mais barata**: ScrapeCreators (pacote de US$ 47 em créditos
   que não expiram) se a documentação oficial confirmar busca por
   hashtag/palavra-chave no Instagram. Vantagem: sem mensalidade. Desvantagem:
   cobertura de Instagram a confirmar.
3. **Manter**: catálogo verificado e importação manual como fallback; o tikwm
   fica apenas como fonte de último recurso (hoje bloqueada) ou é removido quando
   o provedor entrar.
4. **Mudanças de código previstas quando houver aprovação** (não feitas): um
   adaptador `src/lib/providers/<nome>.ts` com a mesma interface de
   `mineTrending`/`refreshViralMedia`, origem registrada em cada vídeo
   (`provider`), cadência por fonte no coletor e status por fonte já existente
   na página.

O que **não** muda com qualquer provedor: a classificação de personagem de IA
continua vindo de evidência da fonte (perfil acompanhado ou declaração do
autor), nunca de aparência; perfis novos entram como "não verificados".
