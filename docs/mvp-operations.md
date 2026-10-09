# Operação do MVP

## Estado de lançamento

O código inclui criação de influencers, edição de vídeos, reconciliação fal.ai, publicação oficial, planos PIX e administração. Configuração presente não comprova uma transação real. **Não liberar campanha paga antes de concluir os bloqueios externos abaixo.** Não foram realizadas novas gerações pagas, compras ou publicações sociais durante esta revisão.

## Planos provisórios

| Plano | Valor / 30 dias | Créditos | Conteúdo |
|---|---:|---:|---|
| Starter | R$ 97 | 1.500 | Estúdio e exportação |
| Pro | R$ 197 | 3.500 | Starter + guias escritos |
| Max | R$ 397 | 7.500 | Pro + área futura Criação Ilimitada |

Catálogo único: `src/lib/plans.ts`. PIX único; renovação manual, sem assinatura automática. Saldo não expira; acesso aos módulos dura 30 dias por período adquirido. Aulas gravadas de GPU/ComfyUI ainda não foram entregues e não são apresentadas como disponíveis. GPU e APIs externas têm custos próprios. Revisar margens por modelo/duração antes de definir preço final.

## Administração

`/app/admin` exige sessão válida e UUID na variável de servidor `ADMIN_USER_IDS`. E-mail, formulário de cadastro e parâmetros do navegador não concedem administração. A conta proprietária existente foi habilitada por UUID. Dashboard, pedidos, usuários, calendário e configurações mostram dados reais; listas limitadas aos 500 registros recentes. Suspensão de usuário invalida acesso nas verificações de sessão; administradores não podem ser suspensos pelo painel. Alterações administrativas são registradas.

`INITIAL_CREDITS=0` afeta somente novos cadastros; saldos existentes são preservados. Login/cadastro usam limites distribuídos no banco. Credenciais de geração e tokens sociais ficam no servidor; tokens sociais cifrados AES-256-GCM com vínculo ao usuário/plataforma. Manter `SOCIAL_TOKEN_SECRET` estável e protegido.

## Sync Pay — configuração pendente

O navegador disponível estava na tela de login. Não havia credenciais Sync Pay no servidor. O checkout fica fechado até existir `SYNCPAY_CLIENT_ID`, `SYNCPAY_CLIENT_SECRET` e `SYNCPAY_WEBHOOK_SECRET` e estar habilitado nas configurações.

1. Usar conta de seller aprovada, com API/IP autorizados conforme a Sync Pay. Validar conectividade da hospedagem; não ampliar permissões de rede indiscriminadamente.
2. Guardar client ID e client secret no ambiente do servidor.
3. Cadastrar webhook **event `transaction`** para `https://maquina-de-influencers.vercel.app/api/payments/syncpay/webhook`; guardar o `token` retornado como `SYNCPAY_WEBHOOK_SECRET`. O campo `webhook_url` na criação de PIX não substitui o cadastro do contrato assinado.
4. Implantar as variáveis e confirmar conexão. Realizar uma compra controlada autorizada, conferindo valor, confirmação, créditos e estorno antes de abrir vendas.

O receptor exige `X-SyncPay-Signature` HMAC-SHA256 sobre `timestamp.rawBody`, janela de cinco minutos. Consulta novamente a transação na API autenticada do seller; verifica identificador, BRL, PIX e valor definido no servidor. A função SQL trava pedido e usuário, evitando crédito duplo, regressão de pago para pendente e reativação após estorno. CPF/telefone são enviados ao gateway, não armazenados no banco do app. Timeout na criação mantém o pedido em revisão; não repetir cobranças sem conciliação.

Fontes: [API Sync Pay](https://syncpay.apidog.io/), [consulta V2](https://syncpay.apidog.io/consultar-transa%C3%A7%C3%A3o-v2-43538562e0), [assinatura de webhook](https://blog.syncpayments.com.br/ajuda/webhooks-syncpay-eventos-pagamento/).

## Instagram — configuração pendente

App Meta: `2156021122019663`; produto Instagram Login: `2216110872297651`. O ID do produto Instagram foi configurado no servidor. A Meta exigiu redigitar a senha pessoal para mostrar o segredo; o processo foi cancelado sem alterar credenciais.

- Guardar a chave específica do produto em `INSTAGRAM_APP_SECRET`.
- Configurar redirect exato `https://maquina-de-influencers.vercel.app/api/oauth/instagram/callback`.
- Usar somente `instagram_business_basic` e `instagram_business_content_publish` para o fluxo atual. Não adicionar permissões de mensagens, anúncios ou WhatsApp por conveniência.
- Conectar conta profissional autorizada/testadora e validar conteúdo com autorização antes de publicar para clientes.
- Concluir requisitos de publicação e App Review para acesso externo. O app estava **não publicado**. Não foi enviado para análise nem foram aceitos termos em nome do proprietário.
- URLs `/privacidade`, `/termos`, `/exclusao-de-dados`, ícone `/app-icon-1024.png` (1024×1024) e categoria “Utilitários e produtividade” foram salvos no cadastro básico da Meta e conferidos após recarregar a página. O aviso de dados básicos faltantes desapareceu. Conferir dados do operador/suporte antes do lançamento público.

TikTok também depende de credenciais/aprovação próprias, creator_info, domínio de mídia verificado e confirmação das opções de privacidade. Não é apresentado como conectado quando faltam requisitos.

## Vídeos e Wan

Novas requisições fal recebem callback assinado Ed25519, validado por chave oficial. O callback apenas reconcilia os IDs existentes do banco: não confia em URLs recebidas nem solicita novas gerações. Polling da galeria não empilha chamadas; erros de consulta são visíveis e não viram uma geração fictícia.

O Wan de Seaside Couple Recast (`cfb6901d-cd77-4866-83ba-ad8759ed565f`) havia concluído no provedor. O arquivo existente foi recuperado, mas o provedor mudou 4:3 para 16:9 e cortou a imagem. Mantido em revisão. Formatos 4:3/quadrado são bloqueados antes de enviar nova geração Wan; preferir outro modelo que aceite o original. A validação final continua necessária nos formatos permitidos.

O vídeo existente foi finalizado em produção, reaproveitando o output pago e recolocando o áudio original, sem nova IA: `audioPreserved=true`, arquivo no Blob, 28,75 segundos e saldo preservado. Continua em revisão pelo corte do enquadramento feito pelo provedor. Não esticar nem recortar silenciosamente para fingir que o enquadramento foi preservado.

## Banco e validação

Migração: `supabase/migrations/20261009080356_commerce_and_security.sql`. Novas tabelas com RLS habilitada, sem acesso `anon`/`authenticated`; RPCs financeiras e de rate limit restritas ao servidor/service_role. Aplicada ao projeto existente pela Management API com credencial local protegida. `scripts/verify-commerce-db.sql` testa pagamento duplicado, ordem de notificações, estorno, limites e privilégios dentro de transação com rollback; não deixa fixtures.

Validação: 269 testes Node (267 aprovados, zero falhas, dois ignorados), TypeScript e build Next aprovados; 63 vídeos com áudio e 148 imagens do catálogo validados. Auditoria pnpm sem vulnerabilidades conhecidas. Banco validado com rollback e RLS restrita. Navegador local isolado: login, plano selecionado, temas, painel e configuração com auditoria. Produção: páginas públicas HTTP 200, administração anônima redireciona para login, cron sem segredo recebe 401 e recuperação de áudio Wan conferida. QA local usa contas fictícias e não tem chaves de provedores/gateway. Manter os testes simulados distintos de validação real externa.

## Agendador verificado

Vercel Cron configurado a cada minuto. Primeira execução automática comprovada no banco em 09/10/2026 às 05:45:28 (São Paulo), concluída às 05:45:29, sem chamada manual ao endpoint nem publicação de teste. A telemetria em `mi_settings/publication-cron-health` permite acompanhar início, sucesso e falha no painel administrativo. `PUBLICATION_CRON_CONFIGURED=true` habilita agendamento; ainda é necessária uma conexão social oficial válida. O endpoint sem Bearer continua respondendo 401.

A correção de datas foi conferida no navegador de produção: sem novos erros de hidratação e com os quatro players principais carregados. Artefatos de QA locais em `artifacts/mvp/` (ignorados no Git).
