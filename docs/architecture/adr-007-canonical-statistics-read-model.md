# ADR 007 — Fonte canônica e cache por requisição das estatísticas

## Status

Aceito no código; linha de base integrada no Supabase de teste ainda pendente.

## Contexto

Ranking, elenco e perfil interpretavam `player_round_stats` de formas diferentes. Parte das telas somava o campo legado `points`, enquanto o ranking oficial usa `ranking_points`, elegibilidade, atividade recente e as seis melhores rodadas. Também existiam dois leitores de ranking com regras distintas. Isso permitia divergência visual e repetia uma projeção cara dentro da mesma renderização.

## Alternativas

| Alternativa | Benefício | Custo/risco |
| --- | --- | --- |
| Criar imediatamente uma tabela acumulada | Leitura potencialmente mais curta | Nova sincronização, backfill, RLS e risco de ficar diferente da fonte original sem uma medição que justifique o custo. |
| Cache global/persistente do ranking | Pode reduzir chamadas entre requisições | Invalidação complexa e risco de servir a temporada ou a pelada errada. |
| Uma interpretação canônica e cache somente por requisição | Elimina divergência de regra e chamadas duplicadas sem estado compartilhado | A consulta detalhada ainda é executada em cada nova requisição e precisa de medição real. |

## Decisão

`ranking_points` é a pontuação oficial, com fallback para `points` apenas em registros antigos. O total exibido como ranking da temporada usa as seis melhores participações; amistosos continuam usando o total de scouts sem ranking. Todas as superfícies de classificação reutilizam `getRankingExperienceData`. Esse read model usa `React.cache` somente durante a requisição atual, sem cache global ou persistente.

O elenco continua consumindo a view `player_season_stats` para totais esportivos da temporada, mas interpreta `ranking_points` no modo oficial e preserva `legacyPoints` para auditoria. O histórico do jogador seleciona somente as colunas utilizadas. As consultas emitem diagnóstico opcional com duração, volume, falhas, p50 e p95.

## Consequências

- Ranking completo, prévia da home e cartões usam a mesma regra de classificação.
- O perfil deixa de somar a pontuação legada e passa a mostrar as seis melhores rodadas no total Ranked.
- Não há migration nem alteração de dados neste lote. Os índices atuais cobrem `round_id`, `player_id` e `(season_id, round_type, status)`; novos índices dependem de `EXPLAIN (ANALYZE, BUFFERS)` em ambiente seguro.
- A tabela acumulada foi adiada. Ela só volta a ser candidata se p95 e plano SQL demonstrarem que consulta/agregação continuam sendo o gargalo depois deste lote.
