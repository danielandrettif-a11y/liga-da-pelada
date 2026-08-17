# Plano de Tarefas: Liga da Pelada - 5 Melhorias de Convocação, Estádios e Cartola

## Visão Geral
Implementação determinística de 5 funcionalidades-chave:
1. Banner de convocação dinâmico com alternância para "Entrar na Lista de Espera" quando vagas normais estiverem lotadas.
2. Banner de convocação com estado "Antes de confirmar" vs "Depois que aceitou/confirmou" para o usuário autenticado.
3. Exibição clara de Dia, Horário e Estádio na aba `/convocacao`.
4. Visualização de quem já salvou e quem falta salvar o time no Cartola na aba `/cartola/ranking?scope=round`.
5. Gestão de Estádios em `/mais/estadios` (com ordem personalizada e links do Google Maps), integração na criação de rodada/convocação, convite enriquecido no WhatsApp e botão "Ver onde fica" no banner de convocação.

## Fases de Execução

- [x] **Fase 1: Banco de Dados & Schema (Migration Supabase)**
  - [x] Criar migration `044_stadiums_management_and_callup_details.sql` para tabela `stadiums`, campos em `callups` (`start_time`, `stadium_id`, `stadium_name`, `stadium_map_url`) e `rounds`.
  - [x] Políticas RLS e RPCs para gestão de estádios e sincronização com convocações/rodadas.

- [x] **Fase 2: Gestão de Estádios (`/mais/estadios`)**
  - [x] Criar server actions em `src/lib/actions/stadiums.ts` (listar, cadastrar, editar, deletar, reordenar).
  - [x] Criar página e componentes em `src/app/mais/estadios/page.tsx` com formulário de estádio, link do Google Maps e reordenação.
  - [x] Adicionar link na página `src/app/mais/page.tsx`.

- [x] **Fase 3: Criação de Convocação, Criação de Rodada & WhatsApp Invite**
  - [x] Atualizar `openCallup` e `CallupAdminCard` para permitir escolher estádio (na ordem cadastrada) e horário (`start_time`).
  - [x] Atualizar `RoundCreator` e `save_round_prelist` para seleção de estádio da lista.
  - [x] Atualizar textos do convite de WhatsApp (na convocação e no card de ADM) com dia, horário, estádio/local com Google Maps e link.

- [x] **Fase 4: Aba de Convocação (`/convocacao`) & Banner da Home**
  - [x] Atualizar `CallupBoard.tsx` para destacar Dia, Horário e Estádio com botão de mapa.
  - [x] Atualizar `getDashboardData` para retornar status do usuário na convocação atual (`myEntryStatus`: `confirmed` | `waitlist` | `none`).
  - [x] Atualizar `OpenCallupBanner.tsx` com:
    - Estado de lotação ("Entrar na lista de espera").
    - Estado "Antes de confirmar" vs "Presença confirmada" / "Na lista de espera".
    - Botão "Ver onde fica" para abrir o mapa do estádio.

- [x] **Fase 5: Cartola - Ranking da Rodada (`/cartola/ranking?scope=round`)**
  - [x] Criar server action `getFantasyRoundLineupStatus` para retornar lista de quem já salvou o time e quem ainda não escalou.
  - [x] Atualizar `src/app/cartola/ranking/page.tsx` e `FantasyRankingList.tsx` para exibir a lista de confirmados/pendentes quando a rodada estiver aberta.

- [x] **Fase 6: Testes & Verificação**
  - [x] Validar testes automatizados com `npm run test` (34 testes passando).
  - [x] Validar compilação do Next.js com `npm run build` (100% de sucesso nas rotas).
