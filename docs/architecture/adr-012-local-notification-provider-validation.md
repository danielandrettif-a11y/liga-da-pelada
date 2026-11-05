# ADR 012 — Fronteira de validação local dos provedores de notificação

- **Status:** aceito
- **Data:** 2026-11-05

## Contexto

O contexto de Notificações combina regras e persistência internas com três efeitos externos: agendamento pelo QStash, entrega Web Push e e-mail pelo Resend. A homologação local precisa provar a nova arquitetura sem guardar credenciais reais no repositório nem declarar que um provedor entregou uma mensagem quando isso não aconteceu.

## Decisão

1. Inbox, preferências e assinaturas push são exercitados contra Auth e PostgreSQL locais.
2. O adaptador QStash de produção permanece inalterado. Um servidor local mínimo valida seu contrato HTTP (autorização, rota de publicação e resposta aceita) durante o smoke.
3. Chaves VAPID e segredos de webhook usados localmente são gerados fora do Git e armazenados somente no arquivo privado de ambiente da homologação.
4. Entrega Web Push para um navegador real e aceitação de e-mail pelo Resend não são simuladas nem promovidas a `verified`; exigem credenciais de homologação/produção e entram no ensaio de rollout.
5. O smoke restaura preferências e remove inbox/assinaturas temporárias, podendo ser repetido sem acumular estado.

## Consequências

- A aplicação e o banco podem ser validados localmente de forma determinística e sem custo ou envio externo.
- O contrato de agendamento é testado pelo mesmo adaptador usado em produção.
- A validação não cobre disponibilidade, reputação, quotas ou entrega efetiva dos provedores. Esses itens ficam explícitos no checklist de implantação, em vez de serem mascarados por mocks.
- Não adicionamos uma abstração de URL ao SDK do Resend apenas para testes; seus adaptadores continuam cobertos por testes automatizados e a aceitação real ocorre no ambiente de rollout.

