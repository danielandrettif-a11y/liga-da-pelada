# Ajustes operacionais e de experiência — pesquisa

## Objetivo

Melhorar quatro fluxos relacionados à operação das partidas, comunicação do Cartola e acesso por senha.

## Decisões

- A troca do empréstimo estrutural é feita antes de iniciar a partida. O jogador recusado fica excluído somente daquela partida e continua elegível nas próximas.
- O servidor recebe e valida a escolha final dos empréstimos; a seleção da tela não é considerada confiável por si só.
- Sem uma Ranked oficial aberta, o Cartola fica somente para consulta. O servidor também bloqueia a gravação do antigo portfólio permanente.
- O Radar Cartola passa a fazer parte do banner principal e o campo recebe uma faixa diagonal de mercado fechado.
- A recuperação de senha usa o fluxo PKCE já empregado pelo cliente SSR do Supabase: e-mail, callback, sessão temporária e atualização da senha.

## Integrações

- `MatchCreator`, `createMatch` e helpers de rodadas incompletas.
- `FantasyExperience` e `saveFantasyLineup`.
- Login, callback de autenticação e nova página de redefinição.

## Riscos tratados

- Empréstimo adulterado no navegador: revalidado no servidor.
- Jogador recusado retirado permanentemente da fila: a recusa não é persistida.
- Mercado visualmente fechado, mas gravável via requisição: bloqueio no Server Action.
- Enumeração de contas na recuperação: mensagem de sucesso genérica.

## Referências

- Documentação local do Next.js 16 sobre Server Actions e formulários.
- Supabase Auth: `resetPasswordForEmail` e `updateUser` com PKCE.
