# Progresso da Implementação: Melhorias de Cosméticos

## Status Final
- [x] Criação do helper `cosmeticBackgroundPosition` em `src/lib/fantasy/cosmetics.ts`.
- [x] Desacoplamento da moldura e foto no `PlayerAvatar.tsx` com novo wrapper e `-inset-[4px]` / `-inset-[5px]`.
- [x] Atualização de `CosmeticsExperience.tsx` com altura `h-32` para os cards da coleção e `cosmeticBackgroundPosition`.
- [x] Atualização do fundo e banner no perfil do jogador em `src/app/jogadores/[id]/page.tsx`.
- [x] Remoção de `overflow-hidden` do medalhão no `RankingPlayerCardModal.tsx` para evitar corte de molduras.
- [x] Atualização de background e formatação da carta em `src/app/jogadores/[id]/carta/page.tsx`.
- [x] Verificação estrita de tipagem TypeScript (`npx tsc --noEmit`) aprovada (0 erros).
- [x] Bateria de testes automatizados (`npm test` / Vitest) aprovada com 14/14 arquivos de teste e 103/103 testes passando.
