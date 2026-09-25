# Fase 2 — código preparado, integração bloqueada por aprovação

**Status: rascunho isolado. Não ativado no app.** Pedido do usuário em 25/09/2026: adiantar código enquanto está fora de casa e só integrar depois que testar/aprovar a fase 1.

Estes arquivos não são importados por telas, ações, APIs ou jobs. Não há flag que ative esta fase, migration nova, alteração no banco ou publicação. A demonstração e as funcionalidades da fase 1 continuam como estavam. Não tratar a presença destes arquivos como aprovação para integrar.

## Preparado em código

- Nove jogadores genéricos com IDs estáveis, posições iniciais e escalação válida 6+3.
- Validação de formação e de atleta BQ único entre os nove relacionados, mesmo com várias cópias.
- Jornada de oito partidas oficiais de Várzea, seis direitos de recompensa e primeiro pacote com escolha de um entre três.
- Seleção de candidatos que permite terminar as seis contratações com goleiro, dois defensores, dois alas/meias e atacante. Usa características congeladas dos contratados e catálogo atual dos candidatos. Catálogo insuficiente preserva o pacote.
- Um treino coletivo e até dois individuais por rodada; recuperação gratuita; preparação temporária sem empilhamento de bônus.
- Ganhos de treino/jogos compartilham teto permanente de +12 por posição, respeitando 99. Não alteram a origem da carta. Atributo relacionado recebe o ganho: DEF→defesa, ALA→passe, ATA→finalização, GOL→físico (último mapeamento é provisório).
- Condição de 0–100, desgaste proporcional aos minutos e recuperação por rodada. Nenhuma espera por relógio, energia ou saldo mínimo para disputar partida.
- Moedas, livro de receitas/despesas, compra de pacote comum após tutorial e venda de genéricos excedentes, sem dinheiro real.
- Proteção contra vender atletas relacionados ou ficar com menos de nove atletas distintos.
- Ticket de partida para retomada, resultado final idempotente, proteção contra refazer placar/recompensa e bloqueio de alterações durante partida.
- Histórico de jogos, gols, assistências e notas por carta/genérico. Registros do clube sobrevivem à venda de um genérico.
- Verificação de conclusão da Várzea e requisito de seis BQ distintos, sem liberar efetivamente a Série D.
- Adaptador **puro** das operações da fase 1 para respeitar escalação, preparação e vínculo do tutorial; nenhum endpoint foi criado.

O motor de partidas 2D pertence à fase 3. Esta pasta recebe um relatório do futuro motor; **não cria resultados nem permite enviá-los pelo navegador**. Títulos e Hall da Fama dependem de competições posteriores; o histórico numérico é sua base, não a implementação completa deles. Comissão e estádio permanecem na fase da Série D.

## Valores provisórios para testar depois

Todas as quantias abaixo são propostas de equilíbrio em `balance.ts`, não decisões finais do usuário:

| Parâmetro | Rascunho |
| --- | --- |
| Caixa inicial | 200 moedas |
| Receita por partida | 100 |
| Bônus de vitória / empate | 40 / 15 |
| Treino coletivo / individual | 30 / 15 |
| Recuperação | Gratuita |
| Pacote comum | 250 |
| Venda de genérico | 40 |
| Ganho por sessão de treino | 0,1 na posição |
| Ganho por jogo com pelo menos 30 minutos | 0,1 na posição |
| Preparação para a próxima partida | +1, sem somar coletivo e individual |
| Desgaste por 90 minutos | 20 de condição |
| Recuperação entre rodadas | 15 |
| Foco de recuperação | 15 |
| Rodadas que concedem pacote | 1, 2, 3, 4, 6 e 8 |

Decisões provisórias de fluxo: tutorial avança por partida concluída, inclusive derrota; compras/abertura de pacotes comuns aguardam as seis contratações para não esgotar o grupo de atletas inéditos; cartas das recompensas não podem ser doadoras até concluir as seis escolhas. Essas restrições poderão ser revistas no teste.

Os genéricos têm nota 55 na posição principal, 45 nas demais de linha e 40 no gol (goleiro principal: 55). Atributos adicionais, curvas de XP mais detalhadas, interface e balanceamento de resultados não foram aprovados. A taxa de 0,1/jogo não foi calibrada para a meta de carreira de 4–6 temporadas; será avaliada com o motor.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `types.ts` | Estado provisório da carreira, escalação, tickets e relatórios |
| `balance.ts` | Parâmetros ajustáveis, rodadas e capítulos |
| `career.ts` | Elenco, treino, condição, moeda, resultados e progressão |
| `recruitment.ts` | Garantia de seis atletas distintos com cobertura de posições |
| `career.test.ts` | Cenários isolados, sem banco nem rede |
| `INTEGRACAO.md` | Roteiro de integração após aprovação |

## Como verificar o código sem ativar

Na raiz do repositório:

```text
npx vitest run --config manager/staged/phase-2/vitest.config.mts
npm run typecheck
```

O comando normal `npm test` continua selecionando os testes do app em `src/`. A configuração acima seleciona somente os testes deste rascunho. O TypeScript também verifica estes arquivos, mas isso não os torna parte do código servido pelo app.

## Limites antes da integração

- Funções puras não autenticam nem gravam. O adaptador futuro deve autenticar, carregar estado, validar intenção e fazer CAS atômico como na fase 1.
- `initializeCareer` só poderá ser chamado uma vez na migração de cada clube; não deve existir botão de reiniciar carreira oficial.
- Nenhum relatório de partida poderá vir do cliente; o servidor gera/persiste o ticket antes da simulação e só aceita conclusão do próprio motor.
- O preço, foco, renda e quantidade de ganho sempre virão da configuração do servidor, nunca do corpo enviado pelo usuário.
- Ganhos/saldo/histórico e pacotes devem ficar na mesma transação, sem uma gravação independente para cada estrutura.
- Cartas existentes, compras e recompensas do ambiente de homologação precisarão ser verificadas na migração. Um catálogo pequeno ou já esgotado pode exigir ajuste da política de recrutamento antes de liberar o tutorial.
- Atributos de jogo aguardam revisão administrativa antes do motor de partidas.

Não há necessidade de testar o app agora. Estes arquivos podem aguardar a avaliação da fase 1 sem mudar a experiência disponível.
