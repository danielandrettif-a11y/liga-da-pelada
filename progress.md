# Progresso do Projeto: Liga da Pelada (Melhorias de Sorteio, Convocação, Cartola e Partidas)

## Status Atual: CONCLUÍDO COM SUCESSO (100%)

### O Que Foi Implementado e Validado:

1. **Sorteio Imediato Direto (`RoundCreator.tsx`)**:
   - Botões com 1 toque direto para "⚡ Sorteio Aleatório" e "⚖️ Sorteio Equilibrado" sem exigir presenças prévias.
   - Opção separada "📋 Ordem de Chegada" para definir os 10 do 1º jogo quando o organizador desejar.
   - Modal com botão principal de sorteio imediato e fallback flexível.

2. **Painel de Contratação de Amigos / Convidados (`CallupBoard.tsx` & `callups.ts`)**:
   - Qualquer usuário logado pode criar perfil de convidado e colocá-lo na convocação (titular ou fila).
   - O criador do convidado (ou o Admin) pode remover o convidado com 1 clique.
   - Migration `051_unlimited_waitlist_and_guest_invite.sql`.

3. **Fila de Espera Sem Limite Fixo (`CallupBoard.tsx`)**:
   - Exibição dinâmica `Fila (X)` sem o limitador rígido de 3 pessoas, expandindo conforme a demanda.

4. **Exibição do Jogador Selecionado na Carta do Cartola (`FantasyActiveCardSlot.tsx` & `fantasy-cards.ts`)**:
   - Resolução e exibição em destaque do nome do jogador alvo (ou dupla / palpite) na carta ativa.

5. **Proteção Anti-Acidente nos Acréscimos (`MatchLiveBoard.tsx`)**:
   - Botões de acréscimo (`+1'`, `+2'`, `+3'`) operam com *Hold to Add* (segurar 550ms) com barra de progresso visual e resposta háptica para impedir toques involuntários durante a partida.

6. **Contador de Fechamento do Mercado (`FantasyExperience.tsx`)**:
   - Mensagem clara indicando quanto tempo falta para o mercado fechar ("Mercado fecha em MM:SS").


9. **Sorteio Direto Sem Exigência de Presença (`rounds.ts` & `RoundCreator.tsx`)**:
   - Ajustada validação do backend `createRoundWithTeams`: o sorteio direto (aleatório ou equilibrado) agora salva e cria a rodada imediatamente sem travar por falta de lista de presença.
   - Sorteio por ordem de chegada continua disponível e validado quando o organizador opta por registrar os primeiros presentes.

10. **Cartas Dobradinha e Vice-Capitão no Fantasy (`FantasyInventoryModal.tsx`, `FantasyExperience.tsx`, `fantasy-cards.ts`)**:
    - `FantasyInventoryModal` agora recebe a lista de atletas escalados (`lineupPlayers`) e o capitão oficial em todos os pontos de abertura.
    - As cartas Dobradinha e Vice-Capitão filtram estritamente os atletas do time escalado.
    - A Dobradinha exige e valida 2 atletas escalados diferentes, com feedback visual em tempo real e validação segura no backend.

11. **Painel de Contratar Amigo Retrátil (`CallupBoard.tsx`)**:
    - Painel "Contratar Amigo (Convidado)" inicia recolhido por padrão com animação suave e ícone chevron rotativo.
    - Removido o botão de pré-lista lateral redundante.

12. **Banner da Rodada no Mobile (`NextRoundBanner.tsx`)**:
    - Ajustado o enquadramento de fundo (`bg-[center_right_25%] sm:bg-center bg-cover`) e opacidade para o troféu aparecer com nitidez e destaque no celular.
    - Corrigido o corte do número da rodada ajustando line-height, largura flexível e padding direito no texto itálico com gradiente (`bg-clip-text`).

13. **Zerar Cartas da Conta & Distribuição em Massa de Pacotes para Quem Escalou (`fantasy-cards.ts`, `FantasyCardTester.tsx`, `reset_cards_and_award_packs.sql`)**:
    - Criada a Server Action `resetMyAccountCards()` que remove com segurança todas as cartas do inventário (`fantasy_user_cards`), ativações (`fantasy_card_activations`) e ofertas/pacotes pendentes (`fantasy_round_packs`, `fantasy_pack_offers`) da conta autenticada, deixando-a com 0 cartas para testes do zero.
    - Criada a Server Action `distributePackToAllLineupUsers()` que identifica todos os usuários únicos com escalação registrada em `fantasy_lineups`, limpa pacotes anteriores da rodada de referência e concede 1 pacote novo (`available`) para cada um deles.
    - Atualizado o componente `FantasyCardTester.tsx` no painel de administração (`/admin/cartola`) com botões dedicados e modal de confirmação para exclusão acidental.
    - Criado o script SQL complementar `scripts/reset_cards_and_award_packs.sql`.
    - Todos os 75 testes automatizados (12 arquivos) passaram e a compilação do Next.js foi concluída com 100% de sucesso.
