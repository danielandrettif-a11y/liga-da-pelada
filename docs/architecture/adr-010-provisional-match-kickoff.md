# ADR 010 — Montagem local e primeiro apito provisório

## Contexto

A montagem de uma partida já acontece no navegador, mas abrir uma rota dinâmica
recarregava o read model e o primeiro apito só apresentava o cronômetro depois
da resposta do servidor. Em rede móvel, a espera era percebida mesmo com a
criação transacional e idempotente da ADR 009.

## Decisão

- A rodada entrega um snapshot mínimo ao lançador de partida e abre o montador
  localmente, sem uma segunda leitura no clique.
- O primeiro apito congela a intenção, inicia um cronômetro provisório e envia
  a criação com horário e chave idempotente estáveis.
- Até o recibo, gols e controles administrativos permanecem bloqueados. Uma
  falha de transporte reutiliza a mesma intenção; uma rejeição de regra encerra
  o estado provisório e devolve o usuário à montagem.
- O PostgreSQL continua sendo a autoridade. O horário do aparelho é limitado à
  janela dos 15 segundos anteriores ao recebimento e nunca pode ficar no futuro.

## Consequências

- O feedback do apito independe do tempo de resposta da rede, sem tratar uma
  partida local como confirmada.
- Abrir o app do zero sem internet continua fora de escopo; o modo local vale
  para uma rodada já carregada.
- A migration 347 deve preceder o código que envia `p_client_started_at`.
