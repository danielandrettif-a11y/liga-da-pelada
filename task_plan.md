# Plano de Execução: Cartola V2 — Mercado Vivo, Valorização, Tendências e Radar

## Objetivo
Implementar a especificação completa do Cartola V2, consolidando a economia viva (fórmula de valorização calibrada, estabilidade para ausentes, histórico idempotente, patrimônio protegido), tendências de mercado, forma recente, custo-benefício, tags automáticas, popularidade, Radar Cartola, revelação segura de escalações pós-fechamento, melhorias no mercado e suíte completa de testes e simulação econômica.

---

## Fases de Execução

- [x] **Fase 1: Auditoria da V1 e Matriz Atual x V2**
  - [x] Mapeamento dos esquemas do banco, tabelas de fantasy, procedures e actions existentes.
  - [x] Construção da Matriz Atual x V2 com todos os requisitos.
  - [x] Criação do Implementation Plan detalhado.

- [x] **Fase 2: Modelo de Valorização V2 & Configurações**
  - [x] Atualizar `src/lib/fantasy/config.ts` com pesos V2 (40% recente com decaimento, 35% win rate bayesiano, 15% histórico, 10% consistência, min/max prices e limites contínuos).
  - [x] Implementar a fórmula no motor TypeScript `src/lib/fantasy/engine.ts` com garantia de estabilidade para ausentes e tratamento de jogador novo.
  - [x] Migration `048_cartola_v2_market_engine.sql` com alinhamento no PostgreSQL.

- [x] **Fase 3: Tendências, Forma Recente, Custo-Benefício e Tags Automáticas**
  - [x] Calcular tendências (`🔥 EM ALTA`, `➡️ ESTÁVEL`, `📉 EM BAIXA`).
  - [x] Calcular indicadores de forma recente (`🔥 Excelente`, `🟢 Boa`, `⚪ Regular`, etc.).
  - [x] Implementar métrica de custo-benefício (`pts/C$` e score 0-10).
  - [x] Criar gerador de tags prioritárias automáticas (`💎 Bom Custo-Benefício`, `🚀 Revelação`, `👑 Mais Escalado`, etc., máx 2 no card compacto).

- [x] **Fase 4: Popularidade, Capitães, Mais Comprados/Vendidos & Radar Cartola**
  - [x] Implementar agregador performático de popularidade (`% escalado`, `% capitão`).
  - [x] Implementar cálculo de mais comprados e mais vendidos (delta entre rodadas).
  - [x] Criar componente `FantasyRadarCarousel.tsx` com visual moderno e proteção para poucos usuários (amostra mínima).

- [x] **Fase 5: Privacidade Pré-Fechamento & Revelação Pós-Fechamento**
  - [x] Blindar endpoints para retornar apenas agregados antes do fechamento.
  - [x] Criar Server Action `getRevealedLineups` para leitura pública pós-fechamento.
  - [x] Criar componente `FantasyRevealedLineupsModal.tsx`.

- [x] **Fase 6: Experiência do Usuário & Mercado Vivo (Frontend)**
  - [x] Aprimorar `FantasyPlayerCard.tsx` com badges, tendências, variação e tags.
  - [x] Criar `FantasyPlayerDrawer.tsx` com gráfico de linha de histórico de preço e últimas 5 rodadas.
  - [x] Expandir `FantasyExperience.tsx` com ordenação por 9 critérios, 7 filtros por tags e saldo dinâmico.
  - [x] Enriquecer a seção Cartola em `src/app/jogadores/[id]/page.tsx`.

- [x] **Fase 7: Suíte de Testes Automatizados (V2-T01 a V2-T21)**
  - [x] Bateria de testes unitários para cada requisito de valorização, ausência, limites e empates.
  - [x] Testes de idempotência e consistência de patrimônio.
  - [x] 56 testes passando com 100% de sucesso.

- [x] **Fase 8: Simulação Econômica (15 Rodadas) & Validação Final**
  - [x] Simulação de múltiplas rodadas com 25 jogadores e 15 usuários.
  - [x] Auditoria de inflação/deflação e distribuição balanceada de preços (Preço médio C$ 10.00 -> C$ 11.32, piso C$ 5.00, teto C$ 25.00).
  - [x] Validação do build de produção (`npm run build`) em todas as 34 rotas.
