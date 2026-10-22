# Avaliação pós-otimização — 2026-10-22

## Resultado

Nota técnica conservadora do estado pronto para deploy: **8,8/10**, contra **7,8/10** antes deste lote e **6,1/10** no início do ciclo de otimização.

A nota não presume melhoria que ainda não foi observada em tráfego real. As medições de RPC abaixo vieram do Supabase de teste; Web Vitals reais começarão a formar a linha de base depois do deploy do coletor persistente.

## Oito frentes

| Frente | Estado | Evidência |
| --- | --- | --- |
| RLS initplan | Concluída no teste e oficial | 0 policy com chamada `auth` por linha. |
| Policies permissivas duplicadas | Concluída no teste e oficial | 0 par sobreposto após consolidação. |
| Coletiva autenticada | Concluída | Cursor de 60 mensagens, p95 13,032 ms no teste. |
| RPCs de rodada/pagamento | Concluída | Leitura única p95 5,616 ms; fechamento e restauração transacionais; ensaio de ida/volta aprovado. |
| Imagens pesadas | Código concluído, publicação pendente | 52,68 MB → 4,30 MB no lote; `public` 96,9 MB → 37,7 MB. |
| Cache do Cartola | Concluído no código e banco | Fonte p95 16,550 ms; cache de 5 min versionado e fallback seguro. |
| Observabilidade persistente | Concluída no código e banco | Retenção 30 dias, dashboard p50/p95/máximo/falhas e alertas. |
| Modularização | Em progresso contínuo | Novos leitores/gateways de Coletiva, Cartola, pagamentos e rodada fora das Actions. |

## Medição do Supabase de teste

Cada operação recebeu 20 amostras dentro de uma transação revertida, com contexto autenticado quando necessário.

| Operação | p50 | p95 | máximo |
| --- | ---: | ---: | ---: |
| Coletiva paginada | 11,699 ms | 13,032 ms | 16,886 ms |
| Pagamentos da rodada | 5,199 ms | 5,616 ms | 9,798 ms |
| Fonte cacheável do Cartola | 12,708 ms | 16,550 ms | 29,563 ms |
| Versão do cache do Cartola | 39,395 ms | 40,437 ms | 42,704 ms |

## Qualidade e segurança do rollout

- `npm run check`: 801/801 testes, typecheck e build aprovados.
- Migrations 335–338 e correções financeiras 340–341 aplicadas e validadas no projeto oficial.
- O ensaio financeiro encontrou e corrigiu referências antigas inválidas (`created_at`, alias `expense`, `max(uuid)`) e a ordem do rollback antes do rollout do novo código.
- Smoke autenticado oficial aprovado para Coletiva, pagamentos e versão do Cartola, dentro de transação revertida.
- Nenhum teste de carga foi executado no banco oficial.
- A migration 339 só deve rodar junto do deploy dos WebPs; executar antes quebraria as URLs de quatro cartas e quatro escudos.

## Espaço restante

Para chegar perto de **9,3/10**, faltam: publicar o lote, aplicar a 339 no mesmo rollout, observar ao menos sete dias de p50/p95/Web Vitals reais, criar alertas por orçamento e continuar reduzindo `fantasy.ts`/`rounds.ts` por casos de uso. O principal risco restante já não é uma consulta isolada conhecida, mas regressão de cauda em rede móvel e fluxos concorrentes do Ao Vivo.
