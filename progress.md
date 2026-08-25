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
8. **Cartas Dobradinha e Vice-Capitão no Fantasy (`FantasyInventoryModal.tsx`, `FantasyExperience.tsx`, `fantasy-cards.ts`)**:
   - `FantasyInventoryModal` agora recebe a lista de atletas escalados (`lineupPlayers`) e o capitão oficial em todos os pontos de abertura.
   - As cartas Dobradinha e Vice-Capitão filtram estritamente os atletas do time escalado.
   - A Dobradinha exige e valida 2 atletas escalados diferentes, com feedback visual em tempo real e validação segura no backend.

9. **Painel de Contratar Amigo Retrátil (`CallupBoard.tsx`)**:
   - Painel "Contratar Amigo (Convidado)" inicia recolhido por padrão com animação suave e ícone chevron rotativo.
   - Removido o botão de pré-lista lateral redundante.

10. **Banner da Rodada no Mobile (`NextRoundBanner.tsx`)**:
    - Ajustado o enquadramento de fundo (`bg-[center_right_25%] sm:bg-center bg-cover`) e opacidade para o troféu aparecer com nitidez e destaque no celular.
    - Corrigido o corte do número da rodada ajustando line-height, largura flexível e padding direito no texto itálico com gradiente (`bg-clip-text`).

11. **Zerar Cartas da Conta & Distribuição em Massa de Pacotes para Quem Escalou (`fantasy-cards.ts`, `FantasyCardTester.tsx`, `reset_cards_and_award_packs.sql`)**:
    - Criada a Server Action `resetMyAccountCards()` que remove com segurança todas as cartas do inventário (`fantasy_user_cards`), ativações (`fantasy_card_activations`) e ofertas/pacotes pendentes (`fantasy_round_packs`, `fantasy_pack_offers`) da conta autenticada, deixando-a com 0 cartas para testes do zero.
    - Criada a Server Action `distributePackToAllLineupUsers()` que identifica todos os usuários únicos com escalação registrada em `fantasy_lineups`, limpa pacotes anteriores da rodada de referência e concede 1 pacote novo (`available`) para cada um deles.
    - Atualizado o componente `FantasyCardTester.tsx` no painel de administração (`/admin/cartola`) com botões dedicados e modal de confirmação para exclusão acidental.
    - Criado o script SQL complementar `scripts/reset_cards_and_award_packs.sql`.
    - Todos os 75 testes automatizados (12 arquivos) passaram e a compilação do Next.js foi concluída com 100% de sucesso.

14. **Correção de Posições Inválidas e Sincronização de Vagas no Cartola (`FantasyExperience.tsx`, `fantasy.ts`)**:
    - Resolvido o erro "As posições da escalação são inválidas": a geração de `slotAssignments` agora é normalizada pelo `playersPerTeam` ativo e sempre envia papéis válidos (`ATA`, `MEI`, `DEF`, `GOL`).
    - Resolvido o bug do jogador mudando de posição ao salvar incompleto: a restauração do estado `selected` prioriza os `slot_index` reais salvos no banco de dados (`fantasy_lineup_players`), eliminando qualquer desordem heurística ou de perfil.
    - Sincronização automática em tempo real de `selected` quando `playersPerTeam` muda na liga (5 vs 6).

15. **Suporte e Visibilidade de Cosméticos no Perfil e App (`PlayerAvatar.tsx`, `cosmetics.ts`)**:
    - `PlayerAvatar` agora aceita `frameKey`, `auraKey` e `frameClass`, renderizando as molduras oficiais Várzea Premium (alambrado, rede, neon, faixa de capitão) e efeitos de aura.
    - Criada a Server Action `getMyEquippedCosmetics()` para carregar os cosméticos equipados da conta e exibi-los no avatar da barra superior, perfil e ranking.

16. **Robustez no Envio de Notificações Web Push (`push-notifications.ts`)**:
    - Inclusão do `createServiceClient()` como canal prioritário para consulta de inscrições ativas e perfis na tabela `push_subscriptions`, contornando bloqueios de RLS quando chamados via webhooks de timer ou por finalizações de partida.

17. **Redesign da Barra Superior e Tela Inicial (`Header.tsx`, `SessionHeaderActions.tsx`, `page.tsx`)**:
    - Removido o bloco "Boa noite/Olá" redundante da tela inicial.
    - Barra superior fixa no topo (`Header`) com o logo e nome do app à esquerda e os 3 ícones à direita: 1) Sino de notificações com contador de não-lidas, 2) Botão de compartilhamento do app e 3) Foto do jogador com moldura cosmética do passe e atalho para o perfil.
    - Banners de Convocação, Rodada e Passe de Temporada sobem diretamente para o topo da tela inicial.

18. **Limpeza e Otimização da Aba Mais (`mais/page.tsx`)**:
    - Removido o item redundante "Enviar pacote" de `ADMIN_SECTIONS`, centralizando toda a gestão de pacotes e cartas no painel do Cartola.

19. **Ranking da Temporada com Base nas 6 Melhores Partidas (`stats.ts`, `ranking.ts`, `RankingExperience.tsx`, `RankingPlayerCardModal.tsx`)**:
    - A pontuação principal da temporada (`entry.points`) agora é calculada exclusivamente pela soma das **6 melhores partidas** de cada jogador, protegendo os atletas contra ausências eventuais ou dias ruins.
    - Os filtros individuais (gols, assistências, vitórias, aproveitamento) continuam acumulando o total da temporada inteira.
    - Adicionado banner informativo com ícone `!` no topo da aba Ranking explicando a nova regra.
    - Modal da carta do jogador atualizado para listar as partidas ranqueadas (destacando quais estão somando no Top 6) e indicar a nota de corte exata para o próximo jogo.

20. **Remoção do Prêmio de Melhor Goleiro da Rodada Finalizada (`rodadas/[id]/page.tsx`)**:
    - Removido o seletor `BestGoalkeeperPicker` da página da rodada finalizada.

21. **Validação e Build**:
    - 101 testes automatizados do Vitest passando (100%).
    - Build de produção do Next.js 16 (Turbopack) gerou todas as 42 rotas estáticas e dinâmicas com código de saída 0.
