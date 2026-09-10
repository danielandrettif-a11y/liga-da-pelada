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
- Abrir um modal com Defensor, Ala/Meio, Atacante, Goleiro, Chuteira de Ouro, Garçom, Técnico e WAG, incluindo foto e detalhes da conquista.

## Fase 5: premiações expandidas e posição histórica
- Congelar a posição do atleta em cada linha de estatística da rodada.
- Somar Defensor, Ala/Meio e Atacante somente dentro da tag usada naquela rodada.
- Adicionar Melhor Goleiro, Chuteira de Ouro e Garçom ao perfil e ao popup.

## Fase 6: galeria de conquistas
- Remover números da lista principal e reforçar visualmente cada categoria.
- Transformar cada vencedor em uma área clicável.
- Mostrar resultado, participação, regra e desempates somente na ficha detalhada.
