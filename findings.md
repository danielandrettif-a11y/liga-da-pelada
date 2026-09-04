# Descobertas e Decisões Técnicas: Pontuação BQ v5 e Sorteio por Velocidade

## 1. Unificação de Pontuação e Integridade de Centésimos
- **Descoberta:** O sistema Ranked e o Fantasy possuíam discrepâncias históricas na base (ex: ausência de pontos de empate no Cartola, pesos de gols sofridos e bônus de atleta defensivo acoplado na base do Cartola).
- **Decisão Arquitetural:** 
  - Todo o cálculo BQ opera com centésimos inteiros (`Math.round(x * 100)`) em `src/lib/bq-scoring.ts` para anular qualquer erro de ponto flutuante (`0.1 + 0.2 != 0.3`).
  - O bônus DEF na base do atleta foi completamente eliminado do Cartola (`cleanSheets * 1.0` removido da base). Agora a proteção defensiva é apurada exclusivamente na vaga de escalação DEF.
  - As 8 métricas básicas foram alinhadas tanto em código quanto em banco (`ranking_rules` e `fantasy_settings`).

## 2. Teto e Bônus Posicionais no Cartola
- **Descoberta:** Atletas na vaga de zagueiro/defensor podiam acumular Clean Sheets excessivos gerando distorção estatística em relação a atacantes e meias.
- **Decisão Arquitetural:**
  - DEF: Clean Sheet (+1.5/jogo), Proteção Parcial (+0.5/jogo se sofreu exatamente 1 gol), Bônus Muralha (+3 se ≥ 3 clean sheets). O somatório total do bônus DEF possui teto determinístico de **10.0 pontos** (`min(10.0, rawBonus)`).
  - MEI: Bônus de Assistência (+1.0/assistência) e Bônus Maestro (+3 se ≥ 2 assistências).
  - ATA: Bônus Artilheiro (+3 se ≥ 2 gols).
  - GOL: Bônus Clean Sheet de Goleiro (+4 se ≥ 1 jogo sem sofrer gols atuando no gol).
  - Capitão: Multiplicador exato de 1.5x aplicado diretamente sobre o total da pontuação final da rodada.

## 3. Segurança no Reprocessamento de Temporadas
- **Descoberta:** Reprocessar uma temporada com mercado aberto ou rodada em andamento corrompe snapshots ou gera concorrência no fechamento.
- **Decisão Arquitetural:**
  - Criação das funções SQL `preview_reprocess_season` e `reprocess_active_season_v5` com trava estrita: aborta imediatamente com exceção se houver rodada com status `in_progress` ou com mercado em status `open`.
  - Execução atômica dentro de transação, atualizando `fantasy_lineup_players`, `fantasy_lineups` e o ranking da temporada.
  - Tela admin com prévia detalhada, cards informativos e modal com confirmação dupla para evitar disparos acidentais.

## 4. Algoritmo de Sorteio por Velocidade e Privacidade
- **Descoberta:** O atributo de velocidade dos jogadores é uma métrica subjetiva do administrador e não deve ser exposta aos usuários comuns da liga.
- **Decisão Arquitetural:**
  - Tabela `player_admin_attributes` protegida com RLS restrita ao papel `service_role` ou verificada via server action com credenciais de admin (`requireAdminPermission`).
  - Tratamento de nulos: Atletas sem avaliação de velocidade registrada são tratados estritamente em memória com o valor neutro padrão de **2 estrelas** (`2★`), sem persistência de registros desnecessários.
  - O algoritmo `drawTeamsBySpeed` distribui os jogadores em serpentina ordenados por velocidade e realiza otimização por troca local (`localSwap`) para minimizar a variância da média de velocidade entre os times.
  - Proteção de borda: Se `teamCount < 2`, a troca local é abortada imediatamente sem disparar erro de índice.
