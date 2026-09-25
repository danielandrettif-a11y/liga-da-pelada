# BQ Manager — primeira entrega

## O que esta fase entrega

- `/bq-manager`: entrada na carreira, mesmo login do app, criação de um clube por conta.
- `/bq-manager/demo`: demonstração sem login com atletas fictícios, pacotes e cópias para testar as duas evoluções. Estado só em memória; recarregar reinicia.
- Cartas com origem congelada, notas por posição, explicação do geral e composição de ganhos.
- Pacotes com direito previamente concedido pelo servidor; oferta sorteada uma única vez e escolha persistida. Pacotes garantidos excluem descobertos; podem exigir posição.
- Herança, fusão de quatro cópias, álbum permanente e gravação atômica com controle de versão.
- Link em **Mais → BQ Manager**.

Criar um clube nesta fase não concede cartas/pacotes de campanha. As nove genéricas e os desafios que concedem as seis BQ serão implementados na fase 2. A demonstração permite revisar a mecânica sem antecipar recompensas reais. Não há partidas, treino executável, economia, mercado ou PvP ainda.

## Dois bancos, duas migrations

1. No Supabase **atual do app**, executar `supabase/migrations/185_manager_read_only_catalog.sql`, após a sequência atual até 184. Acrescenta apenas uma função de leitura autenticada, sem mudar OVR, ranking ou dados esportivos. Expõe apenas atletas selecionáveis com fórmula v11, posições, características, amostra de goleiro, tendência e scouts públicos da amostra de cálculo (não totais da carreira).
2. Criar um projeto Supabase **exclusivo do jogo** e nele executar `manager/supabase/migrations/001_foundation.sql`. O script recusa bases que tenham as tabelas conhecidas do app. Não colocar esse arquivo na sequência de migrations do app.
3. No servidor do app, configurar:

```dotenv
BQ_MANAGER_SUPABASE_URL=https://PROJETO-DO-JOGO.supabase.co
BQ_MANAGER_SUPABASE_SERVICE_ROLE_KEY=CHAVE-SECRETA-DO-JOGO
```

Não colocar a chave em variáveis `NEXT_PUBLIC`, no navegador ou no Git. A URL precisa ser diferente da do app. O código nunca usa a base do app como fallback para gravar o jogo. Manter também as variáveis existentes de login do app.

4. Reiniciar o app. Entrar com conta comum, abrir BQ Manager e criar o clube.

Sem configuração do jogo, a entrada informa que a carreira está em preparação e oferece a demonstração. Falha no catálogo não apaga inventário ou descobertas. Durante indisponibilidade da fonte, fusões e escolhas de ofertas já registradas continuam independentes da consulta ao app.

## Modelo de confiança e persistência

As sessões continuam no Supabase original; não há login duplicado no projeto do jogo. Cada ação revalida a conta no servidor, deriva `owner_id` do usuário autenticado e lê o estado oficial. O navegador envia apenas a intenção (IDs, posição, modo e versão), nunca a nova nota, recompensa ou estado.

Todas as tabelas do jogo têm RLS habilitada, sem acesso para anon/authenticated. Somente o servidor usa a chave de serviço. O UUID de dono é externo ao projeto do jogo: não tem FK para `auth.users` do novo projeto.

Na fase 1, `manager_clubs.state` é um documento JSON versionado de agregado de clube (identidade, cartas, descobertas, pacotes). `manager_commit` compara versão e grava estado/evento na mesma transação. Duas abas não conseguem gastar a mesma cópia/pacote. A chave primária de dono garante um clube por conta. Sem exclusão física de histórico.

Essa representação é deliberadamente pequena para a fase de cartas; antes do mercado, separar cartas, inventário e transações em tabelas próprias para transferências entre donos. Não transformar o documento inteiro em transporte de histórico infinito ou partidas.

Não existe ação pública de conceder pacote, moeda, treino ou criar cartas. `manager_grant_pack` é reservado ao serviço de recompensas e deduplica por `(owner_id, reward_key)`. Na fase 2, chaves serão derivadas do desafio concluído. A UI nunca recebe a chave de serviço.

## Teste de persistência em banco de homologação

Após criar um clube em um projeto **de teste**, o operador pode conceder direitos de pacote pelo SQL Editor do banco do jogo. Substituir o UUID pela conta de teste do app:

```sql
select public.manager_grant_pack(
  'UUID-DA-CONTA-DE-TESTE'::uuid, 'qa-first-choice', 'choice',
  'Escolha inicial de teste', true, null
);
```

Executar de novo a mesma chave deve retornar `false` sem duplicar. Para pacotes posteriores, usar chaves diferentes e `guaranteed`; parâmetro final pode ser `DEF`, `ALA_MEI`, `ATA` ou `GOL` para cobertura de posição. Não conceder esses pacotes manualmente na carreira real: as recompensas finais dependem da Várzea.

Verificar em homologação:

- Conta sem atleta vinculado também cria um clube; segundo envio recupera o existente.
- Abrir pacote, recarregar antes de escolher: mesmas opções e mesmas notas.
- Escolher, recarregar: uma carta nova, sem duplicar se repetir a solicitação.
- Duas abas tentando consumir as mesmas cartas: uma vence, outra recebe conflito/estado recente.
- Uma segunda conta não lê nem altera o primeiro clube. Requisições REST diretas com anon/authenticated não acessam tabelas/RPCs do jogo.
- Catálogo fora do ar: não abrir novos pacotes; guardar ofertas e inventário existente.
- Mudar OVR/foto/nome no app não altera os valores/textos já copiados. A URL da foto é congelada; substituir o arquivo na mesma URL ainda pode mudar os pixels (cópia de mídia histórica fica para etapa própria).

## Escolhas técnicas para revisão

Herança compara a nota original da doadora com a nota **permanente atual** da principal; eleva até essa nota, conservando ganhos separados sem dupla contagem. Doadores de fusão inferior não podem ter nenhuma posição original superior à principal atual. Doadora vinculada vincula a principal, evitando liberar recompensas pelo consumo.

OVR original é mantido exatamente como publicado; após ganho, usa a composição v11 com as características congeladas. O catálogo ignora origens cuja composição atual difira mais de 0,11 da nota publicada, aguardando recálculo consistente. Goleiro usa elegibilidade explícita da amostra, não uma inferência de nota alta.

Cinco atributos nesta fase são rascunhos: finalização=ATA, passe=ALA/MEI, defesa=DEF, velocidade=média(ATA, ALA/MEI), físico=média(DEF, ALA/MEI). Todos começam `attributesReviewed=false`; são estimativas de jogo, não avaliações físicas reais. Editor ADM e revisão precedem o uso no motor da fase 3.

Forma temporária usa a última tendência consultada ao entrar na tela. Não aumenta OVR permanente; recalcular no servidor na entrada das partidas quando elas forem implementadas.

## Verificações locais

```text
npm run typecheck
npm test
npm run build
```

Testes do motor ficam em `src/lib/bq-manager/engine.test.ts`, incluindo congelamento, pesos do OVR, elegibilidade de goleiro, seis descobertas distintas, ofertas estáveis, rejeição de IDs indevidos, limites, dupla contagem e vínculo de cartas.

Migrations são arquivos preparados para os dois projetos. Aplicação remota e teste com contas reais dependem da configuração desses ambientes; não considerar a carreira publicada apenas porque a demonstração funciona.

### Resultado local — 25/09/2026

- TypeScript sem erros.
- Suíte existente + motor: 295 testes passaram; cinco testes adicionais de autoridade das ações também passaram (300 no total).
- Seis testes de interface passaram: três fluxos em Chromium móvel e desktop (pacotes/álbum, herança e fusão de quatro cartas, incluindo ausência de rolagem horizontal).
- Build de produção concluído. Sem credenciais reais no ambiente, foram usados URL/chave fictícias locais apenas para compilar e testar a demonstração. Consultas globais existentes à convocação registraram indisponibilidade esperada desse endereço.
- Migrations ainda não executadas em PostgreSQL/Supabase: validar privilégios, transações, duas contas e persistência no projeto de homologação seguindo os passos acima antes de liberar a carreira.
