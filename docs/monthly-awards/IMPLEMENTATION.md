# Prêmios mensais — implementação

## Fase 1: cálculo
- Criar RPC para classificar atletas e técnicos por mês.
- Aplicar desempates e distinguir resultado provisório/final.

## Fase 2: perfil
- Criar tipos e apresentação das conquistas.
- Carregar os prêmios junto dos demais dados do perfil.

## Fase 3: qualidade
- Testar rótulos e normalização.
- Executar typegen, TypeScript, testes e build.

## Fase 4: BQ The Best na home
- Consultar os quatro vencedores do mês anterior em uma única RPC.
- Exibir uma chamada clicável dentro do banner da agenda.
- Abrir um modal com DEF, MEI, ATA e Técnico, incluindo foto e pontuação.

## Fase 5: premiações expandidas e posição histórica
- Congelar a posição do atleta em cada linha de estatística da rodada.
- Somar DEF, MEI e ATA somente dentro da tag usada naquela rodada.
- Adicionar Melhor Goleiro, Chuteira de Ouro e Garçom ao perfil e ao popup.
