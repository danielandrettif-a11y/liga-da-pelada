# Linha de base para implantação no Supabase oficial

Auditoria somente de leitura em 12/10/2026. Nenhuma migration ou alteração de
dados foi executada nesta auditoria.

## Projeto oficial (`qffxktwxsqyiijboeftr`)

- 1 pelada (`b0000000-0000-0000-0000-000000000001`, nome atual `Liga da Pelada`).
- 61 vínculos de pelada, 67 jogadores, 10 rodadas e 1 temporada do Cartola.
- A função `get_fantasy_market_read_model(uuid)`, definida na migration 252,
  está presente.
- A coluna `leagues.slug` e a tabela `league_invites`, introduzidas na 253,
  não estão presentes. Portanto, a 253 não está integralmente instalada.
- O painel de migrations está vazio e
  `supabase_migrations.schema_migrations` não existe.
- O plano Free não inclui backups agendados; o painel não mostra backup
  disponível para restauração.

## Projeto de teste (`dukjlpdkyngiqxffrxgc`)

- 3 peladas, 66 vínculos, 68 jogadores, 11 rodadas e 2 temporadas do Cartola.
- A BQ original preserva o mesmo ID e os mesmos 10 IDs de rodada do oficial
  (fingerprint MD5 ordenada: `d7e4c5a3997e098d995f1c213282ebca`).
- A BQ do teste tem 64 vínculos, contra 61 no oficial; há duas peladas e uma
  rodada adicionais. O teste não é uma cópia exata do estado atual de produção.
- `leagues.slug` e `league_invites` existem, mas a tabela de histórico de
  migrations contém zero registros. O SQL foi aplicado fora do fluxo de
  registro da CLI.

## Consequências e sequência segura

1. Não executar `supabase db push` apontado ao oficial: sem histórico, ele não
   sabe quais das migrations locais antigas já foram executadas manualmente.
2. Preparar e verificar uma exportação manual do banco oficial antes de
   qualquer mudança. Backup de banco não substitui cópia dos arquivos do
   Storage; avaliar os dois separadamente.
3. Ensaiar as migrations 253–310 em ordem sobre uma cópia **fresca** da linha
   de base oficial, em ambiente local ou no projeto de teste (que o usuário já
   autorizou substituir). Identificar adaptações de replay necessárias sem
   modificar os arquivos históricos para ocultar falhas.
4. Validar cada bloco e o aplicativo com dados antigos; só então planejar uma
   janela para produção, com a exportação verificada e um procedimento de
   recuperação.
5. Corrigir o registro do histórico de migrations de forma coerente com o
   esquema efetivamente instalado; registrar uma migration como aplicada não
   executa seu SQL e não deve ser usado como substituto de teste.

Os 58 arquivos numerados de 253 a 310 estão presentes localmente, sem lacunas
ou duplicatas nessa faixa, mas ainda não estão versionados no Git.
