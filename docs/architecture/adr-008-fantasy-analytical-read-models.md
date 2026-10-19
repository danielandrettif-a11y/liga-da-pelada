# ADR 008 — Modelos analíticos do Cartola por requisição

## Contexto

Ranking, ficha do atleta, histórico e destaques do Cartola misturavam consulta Supabase, agregação e formatação dentro de uma única Server Action extensa. Além de dificultar manutenção, dois leitores não limitavam todos os dados à temporada ativa: a ficha podia somar scouts antigos e o histórico pessoal podia retornar escalações de outras peladas.

Uma tabela acumulada adicional também foi considerada para acelerar estatísticas. Antes de introduzir sincronização, reconstrução e mais uma fonte de verdade, foi medido o modelo atual no Supabase de teste.

## Decisão

- Consultas analíticas ficam em adaptadores de infraestrutura com seleção explícita de colunas e filtros de pelada/temporada.
- Agregação do ranking e seleção de destaques ficam em funções puras, cobertas por testes.
- O ranking e o histórico detalhado podem usar `React.cache`, limitado à requisição atual. Não haverá cache global de dados dependentes de sessão, pelada ou temporada.
- `player_round_stats` e `player_season_stats` permanecem fontes autoritativas. Não criar tabela acumulada enquanto as medições atuais permanecerem dentro do orçamento e a paridade estiver correta.
- O benchmark de estatísticas é somente leitura e deve apontar para o Supabase de teste. Ensaios mutáveis entre peladas continuam exigindo credenciais E2E e a marca explícita de base descartável.

## Consequências

- Ficha e histórico deixam de misturar temporadas e peladas.
- O ranking evita recomputação duplicada dentro da mesma renderização e reduz o payload de contas, perfis e cosméticos.
- As regras analíticas podem ser testadas sem Supabase e os filtros críticos têm testes no adaptador.
- O tempo observado ainda inclui rede/PostgREST; caso o p95 cresça com volume real, o próximo passo é analisar o plano SQL das consultas específicas antes de alterar o esquema.
- Não existe invalidação entre requisições porque nenhum cache compartilhado foi criado.

## Alternativas rejeitadas

- **Tabela de totais por jogador agora:** adicionaria consistência eventual, gatilhos/reprocessamento e risco de divergência sem evidência de gargalo.
- **Cache global das Server Actions:** poderia compartilhar dados de sessão ou pelada entre usuários e exigiria uma estratégia de chaves e invalidação ainda não necessária.
- **Manter agregação nas Actions:** preservaria o acoplamento e dificultaria provar isolamento por temporada.
