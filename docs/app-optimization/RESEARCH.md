# Pesquisa da otimização

## Base medida

- Next 16.3.0 e Sharp 0.35.3 tinham avisos de segurança; alvo corrigido: Next 16.3.4 e Sharp 0.35.4.
- 196 testes unitários passavam antes das mudanças.
- As maiores oportunidades estão no JavaScript do Cartola, no CSS global, nas consultas repetidas e nos avatares de 512 px usados como miniaturas.
- A aplicação já paraleliza parte das consultas e possui carregamento dinâmico de modais; essas características devem ser preservadas.

## Restrições

- Consultas dependentes de usuário/cookies não podem ficar dentro de `unstable_cache`.
- Fluxos E2E administrativos exigem uma conta e um banco exclusivos para teste.
- Migrações novas precisam ser reversíveis, manter RLS e não mudar regras de pontuação.
