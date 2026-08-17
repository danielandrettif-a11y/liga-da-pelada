# Progresso do Projeto

## Funcionalidades Implementadas e Validadas

### Lote 1 (Gestão de Estádios & Convocação):
1. **Migration Supabase & Schemas**: `044_stadiums_management_and_callup_details.sql` criada com tabela `stadiums`, campos de localização nas convocações e rodadas, triggers e RLS.
2. **Módulo de Gestão de Estádios**: `src/lib/actions/stadiums.ts`, `src/components/StadiumsManager.tsx`, `/mais/estadios` e link no menu `/mais`.
3. **Abertura de Convocação & Convite WhatsApp Enriquecido**: `src/lib/actions/callups.ts`, `src/components/CallupAdminCard.tsx`, `src/components/CallupBoard.tsx`.
4. **Criação de Rodadas com Estádio**: `src/lib/actions/rounds.ts`, `src/components/RoundCreator.tsx`, `/admin/rodada`.
5. **Banner da Home Dinâmico**: `src/components/OpenCallupBanner.tsx`, `src/lib/actions/dashboard.ts`, `src/app/page.tsx`.
6. **Cartola - Ranking da Rodada com Confirmados vs Pendentes**: `src/lib/actions/fantasy.ts`, `src/components/fantasy/FantasyRankingList.tsx`, `src/app/cartola/ranking/page.tsx`.

### Lote 2 (Experiência do Usuário, Coletes, Tutorial e Gerador de Arte):
7. **Transições Rápidas**: Animações reduzidas para 150-200ms em `src/app/globals.css`.
8. **Zoom na Foto dos Atletas**: Modal lightbox em `src/components/PlayerAvatar.tsx`.
9. **Convocação Oculta ao Iniciar Rodada**: `src/lib/actions/callups.ts` e `src/lib/actions/dashboard.ts`.
10. **Tag e Cor do Colete no Sorteio de Times**: Paleta de cores de colete e tags de coletes em `src/components/RoundCreator.tsx`.
11. **Popup Pós-Confirmação na Convocação**: Modal de celebração e chamada para o Cartola com resumo de pontuação e valorização em `src/components/CallupBoard.tsx` e `src/lib/actions/fantasy.ts`.
12. **Botões de Ajuda nos Palpites do Cartola**: Ícone `?` e modal explicativo em `src/components/fantasy/FantasyExperience.tsx`.
13. **Tutorial Onboarding do Cartola**: `src/components/fantasy/FantasyTutorialModal.tsx` acionado na 1ª visita ou pelo botão "Tutorial" no topo de `/cartola`.
14. **Gerador de Arte Instagram Story (1080x1920)**: `src/components/RoundInstagramStoryGenerator.tsx` na página `/rodadas/[id]` com suporte a foto de fundo, tabela dos 3 times, artilheiro e garçom de cada time e botões de download/compartilhamento.
