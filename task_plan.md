# Plano de Execução: Cartola V3 — Pacotes, Inventário e Cartas Especiais

## Objetivo
Implementar a especificação completa do Cartola V3: ciclo de recompensas por participação com geração de pacotes por rodada finalizada, sorteio server-side e escolha definitiva entre 2 opções, inventário de instâncias de cartas com raridades balanceadas, ativação segura de 1 carta por rodada com alvos específicos, motor determinístico CardEffectResolver para 10 cartas oficiais, breakdown transparente de pontuação e histórico imutável via snapshots.

---

## Matriz Atual × V3

| Recurso | Existe? | Implementação Atual (V1/V2) | V3 (Objetivo) | Ação a Realizar | Status |
|---|---|---|---|---|---|
| **Pacotes de Recompensa** | Sim | Não existia | 1 pacote por rodada finalizada para quem participou com escalação válida. Proteção `UNIQUE(user_id, round_id)` | Criar tabela `fantasy_round_packs`, trigger/RPC de geração e action | Concluído ✅ |
| **Sorteio e Abertura** | Sim | Não existia | Sorteio server-side de 2 opções distintas salvo no banco; abertura idempotente | Criar tabela `fantasy_pack_offers`, RPC atômica e modal mobile-friendly | Concluído ✅ |
| **Escolha Definitiva** | Sim | Não existia | Usuário escolhe 1 carta; a escolhida vai pro inventário e a outra é descartada | Criar RPC `claim_pack_card` com garantia atômica contra duplo clique | Concluído ✅ |
| **Inventário Pessoal** | Sim | Não existia | Coleção de instâncias de cartas com status `OWNED`, `RESERVED`, `LOCKED`, `CONSUMED` | Criar tabela `fantasy_user_cards`, tela/modal de inventário com filtros e agrupamento | Concluído ✅ |
| **Catálogo Central** | Sim | Não existia | Catálogo com 10 cartas oficiais + 2 experimentais desabilitadas, slugs, raridades e configs | Criar tabela `fantasy_cards` e módulo `catalog.ts` | Concluído ✅ |
| **Raridades e Probabilidades** | Sim | Não existia | `COMMON` (55%), `RARE` (30%), `EPIC` (12%), `LEGENDARY` (3%) centralizados | Criar módulo `config.ts` com pesos de sorteio | Concluído ✅ |
| **CardEffectResolver** | Sim | Não existia | Motor determinístico central sem `if`s espalhados para resolver efeitos | Criar `resolver.ts` e suíte de testes unitários | Concluído ✅ |
| **Carta Ativa na Rodada** | Sim | Não existia | Exatamente 1 carta ativa por rodada (`MAX_CARDS_PER_ROUND = 1`) com suporte a alvos | Criar `fantasy_card_activations` com `UNIQUE(round_id, user_id)` | Concluído ✅ |
| **Reserva / Lock / Consumo** | Sim | Não existia | `OWNED` $\rightarrow$ `RESERVED` $\rightarrow$ `LOCKED` (fechamento) $\rightarrow$ `CONSUMED` (resolução) / Devolução em cancelamento | Implementar ciclo de vida e estorno seguro | Concluído ✅ |
| **Cartas Econômicas** | Sim | Não existia | Crédito Extra (+C$5) e Barganha (20% desc) afetam montagem sem alterar patrimônio real | Integrar ao validador de orçamento em `fantasy.ts` | Concluído ✅ |
| **Cartas de Pontuação** | Sim | Não existia | Super Capitão (3x), Palpite Duplo (2x), Vice-Capitão, Gol de Ouro, Passe de Ouro, Caça-Talentos, Dobradinha, All-In | Integrar ao cálculo de pontuação em `stats.ts` e `resolver.ts` | Concluído ✅ |
| **Snapshots e Breakdown** | Sim | Apenas pontuação-base e palpites | Snapshot completo da carta usada gravado na rodada; breakdown transparente no histórico | Salvar snapshot e exibir no detalhamento da rodada | Concluído ✅ |
| **UI do Cartola V3** | Sim | Não existia | Card de pacote disponível no topo, slot de carta ativa no campinho, modal de inventário e abertura | Criar componentes React modernos | Concluído ✅ |

---

## Fases de Execução

- [x] **Fase 1: Auditoria e Matriz Atual × V3**
- [x] **Fase 2: Modelo de Dados e Migration SQL (`049_cartola_v3_cards_and_packs.sql`)**
- [x] **Fase 3: Catálogo de Cartas e Configurações de Probabilidade (`src/lib/fantasy/cards/`)**
- [x] **Fase 4: Motor de Efeitos Determinístico (`CardEffectResolver`)**
- [x] **Fase 5: Geração de Pacotes, Abertura Idempotente e Escolha Atômica**
- [x] **Fase 6: Gestão de Inventário e Ativação com Ciclo de Vida Completo**
- [x] **Fase 7: Integração com Fechamento, Pontuação e Orçamento**
- [x] **Fase 8: Componentes Frontend (Abertura de Pacotes, Inventário, Slot de Carta Ativa)**
- [x] **Fase 9: Bateria de Testes Automatizados (V3-T01 a V3-T18 + 10 Cartas + Multiusuário)**
- [x] **Fase 10: Validação de Build, Relatório Final e Deploy**
