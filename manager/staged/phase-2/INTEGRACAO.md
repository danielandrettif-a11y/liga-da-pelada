# Roteiro de integração — somente após aprovação da fase 1

## Condição para iniciar

O usuário precisa testar e aprovar a base anterior. O pedido de adiantar código **não** autoriza ativar esta pasta, publicar ou executar migrations. Até a aprovação, manter tudo fora de `src` e sem imports de execução no app.

## Integração futura, em ordem

1. Confirmar o resultado dos testes da fase 1 e incorporar correções necessárias primeiro.
2. Revisar com o usuário os números e restrições provisórias descritos no README desta pasta. Não apresentá-los como escolhas já aprovadas.
3. Definir o estado persistido v2 em uma única estrutura canônica. O `CareerDraft.collection` contém o estado v1 completo: não manter duas cópias independentes do inventário.
4. Preparar migration **no projeto do jogo** para a nova versão. Deve preservar cartas, origem, histórico de eventos, pacotes abertos, escolhas e versão de cada clube. Acrescentar nove genéricos/caixa inicial uma única vez por clube, com registro idempotente. Nunca apagar dados para reiniciar.
5. Atualizar simultaneamente o leitor, o CAS e as ações de coleção para a nova estrutura. Todas as compras, escolhas, fusões, treinos e resultados precisam passar pelo mesmo controle de versão. Não deixar o endpoint antigo da fase 1 consumir cartas ignorando uma partida em andamento.
6. Criar ações autenticadas para intenções de usuário: salvar escalação, treinar, recuperar, comprar pacote, vender genérico e iniciar/retomar partida. Gerar IDs e configuração no servidor. A chave idempotente de compra deve ser persistida/reutilizada no retry.
7. Ligar as telas aos estados abaixo. Exibir a preparação e a condição separadas do OVR permanente. A visualização deve explicar custo e efeito antes de consumir moeda/cartas.
8. Registrar conclusão de partidas **somente pelo motor confiável da fase 3**, usando o ticket já persistido. Não criar endpoint público que receba placar/scouts informados pelo navegador.
9. Testar migração v1→v2, duas contas, duas abas, retry/desconexão e rollback em ambiente separado. Testar catálogo insuficiente sem perder recompensa e progressão com saldo zero.
10. Mostrar a fase 2 integrada para revisão antes de avançar. Série D, comissão e estádio continuam em fase futura.

## Contrato das telas previstas

| Tela/bloco | Conteúdo | Intenções futuras |
| --- | --- | --- |
| Clube | Caixa, capítulo atual, preparação, próxima partida | Iniciar ou retomar ticket existente |
| Jornada da Várzea | Oito capítulos, resultados, seis recompensas | Abrir recompensa já conquistada |
| Elenco | Genéricos e cartas BQ, nota da posição, condição | Selecionar seis titulares e três reservas |
| Treinos | Foco coletivo, até dois individuais, custo/efeito | Treinar ou recuperar |
| Finanças | Receitas/despesas e saldo | Comprar pacote ou vender genérico excedente |
| Histórico | Resultados, jogos, gols, assistências e média de nota | Consultar estatísticas do clube/carta |
| Encerramento da Várzea | Requisitos atendidos/pendentes | Marcar preparação para Série D, sem criar temporada ainda |

## Critérios de aceite

- Conta antiga conserva integralmente as cartas e ofertas da fase 1.
- Nove genéricos e caixa inicial não duplicam em recarregamento/retry/migração repetida.
- O mesmo BQ não pode ocupar titular e banco com cópias diferentes.
- Nenhuma operação isolada deixa saldo negativo, menos de nove identidades ou elenco apontando para carta consumida.
- Uma partida não rende pagamento/pacote/XP duas vezes nem aceita resultado diferente depois de concluída.
- Retomar após desconexão usa o mesmo ticket e estado da partida.
- Treino/games não excedem +12 por posição, nem posição 99; origem continua congelada.
- Forma real e preparação não são gravadas como ganho permanente.
- Cada uma das seis recompensas traz atleta inédito e a seleção permite cobertura útil da formação.
- Saldo zero e condição baixa não exigem pagamento ou espera diária para continuar.
- Ao concluir oito partidas e escolher seis BQ distintos, o clube fica pronto para a futura Série D, preservando a carreira.

## Testes que ainda dependem de integração

Os testes atuais exercitam as regras em memória. Interface, autenticação das novas ações, transações PostgreSQL e recuperação real de conexão serão testadas depois de integrar. Não confundir os testes do rascunho com validação de uma fase 2 publicada.
