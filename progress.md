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

8. **Abertura Interativa de Pacotes & Sistema de Artes das Cartas**:
   - `PackTearInteraction.tsx`: Gesto físico de rasgo via Pointer Events com física direta na DOM e 0 re-renders.
   - `CardRevealStage.tsx`: Revelação 3D das 2 cartas sorteadas com efeito de flip escalonado.
   - `card-assets.ts`: Mapeador de artes individuais na pasta `public/images/cards/[slug].png` com fallback vetorial de alta qualidade.
   - `globals.css`: Keyframes acelerados por hardware (`pack-strip-eject`, `pack-glow-pulse`, `card-emerge`, `card-3d-flipper`).
   - `npm run build` compilado com 100% de sucesso.
