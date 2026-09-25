# BQ Manager — documento mestre do jogo

Decisões reunidas em 25/09/2026. Este documento preserva o planejamento da conversa. Implementação por fases, com teste e aprovação do usuário antes de avançar.

## Identidade e acesso

Jogo de carreira de técnico inspirado em Brasfoot, com partidas táticas de seis contra seis. Cada usuário controla seu clube, não um jogador individual. PvE primeiro; PvP assíncrono depois. Nome: BQ Manager.

Fica dentro do app BQ, com o mesmo login e um projeto Supabase próprio. Qualquer conta cadastrada pode criar um clube, mesmo sem atleta vinculado. Um clube por conta; nome, sigla, escudo, cores e uniforme personalizáveis. Origem em Campos dos Goytacazes/RJ. Gestão em retrato no celular; partidas em paisagem. Beta para poucos jogadores, com progresso persistente e sem reset.

## Carreira e competições

- Começar com nove genéricos; Várzea de 8–10 partidas/desafios.
- Primeiro pacote de recompensa: escolher um entre três BQ. Os seguintes garantem seis atletas BQ distintos, com cobertura útil de posições.
- Exigir seis BQ para entrar na Série D; banco pode conter genéricos. Sem carta própria gratuita.
- Primeira edição profissional: elencos de 2026 congelados por edição. Importação com dados abertos e curadoria manual.
- Grupo inicial inspirado no A13: Madureira-RJ, Portuguesa-RJ, America-RJ, Portuguesa-SP, Água Santa-SP e Pouso Alegre-MG. O clube do usuário substitui aleatoriamente um dos três de fora do RJ. Cadastrar os seis possíveis adversários, com nove atletas profissionais reais por clube.
- Seis clubes, turno e returno, dez rodadas, todos os resultados simulados e quatro classificados. Primeiro beta termina aqui. Classificados guardam o progresso para o mata-mata; eliminados podem repetir a divisão.
- Expansões: mata-mata da D, C, B, A, Copa do Brasil, Libertadores, Sul-Americana e mundiais. C: vinte clubes, dezenove rodadas e fase curta de acesso; formato final ainda será detalhado. A e B: vinte clubes, turno único de dezenove rodadas.
- Acesso/rebaixamento também movimenta clubes da IA. Sem acesso, repetir divisão preservando cartas, clube, evolução e finanças. Meta de 4–6 temporadas para uma subida bem-sucedida da Várzea à A.
- Copa do Brasil adaptada a 32 clubes, paralela ao campeonato. Divisões inferiores se classificam por acesso ou título anterior; clubes da A entram pela divisão e em fase posterior. Final única. Chaves exatas serão detalhadas na fase correspondente.
- A: quatro primeiros para Libertadores, posições 5–10 para Sul-Americana. Copa pode conceder vaga extra na Libertadores e repassá-la quando houver classificação duplicada.
- Intercontinental anual e Mundial de Clubes a cada quatro temporadas. Clubes estrangeiros e chaves serão definidos nas expansões. Carioca depois das copas principais.

## Cartas e elenco

Somente BQ com OVR oficial entram nos pacotes. Novos atletas entram quando tiverem nota; cartas de quem sair continuam como legado. Profissionais são adversários, não contratações do usuário. Pacote normal contém uma carta, sem raridades.

Inventário ilimitado; nove relacionados (seis titulares e três reservas). Não relacionar duas cópias do mesmo atleta. Qualquer atleta pode jogar no gol usando sua nota GOL. Genéricos excedentes podem ser vendidos ao sistema por moeda do jogo; proteger contra ficar sem elenco mínimo. Álbum distingue descoberto alguma vez de posse atual.

Ao abrir pacote, registrar OVR, posições, características, regra de composição, nome, referência da foto e estatísticas públicas. A origem não acompanha alterações futuras do app. Cópias abertas em datas diferentes podem ter notas diferentes.

Cinco atributos: finalização, passe, defesa, velocidade e físico. Rascunho a partir de dados públicos, seguido de revisão ADM. Não reaproveitar velocidade administrativa privada. Fotos BQ seguem uso atual do app. Fotos profissionais exigem fonte permitida; usar arte própria quando necessário. Registrar fonte e licença dos materiais profissionais. A foto referenciada por URL só será uma imagem histórica imutável quando houver cópia própria do arquivo.

## Evolução e OVR

- Treinos e jogos: ganhos permanentes graduais, até +12 por posição. Um foco coletivo e até dois individuais/recuperações por rodada; preparação curta para a próxima partida.
- O geral usa as características congeladas: uma posição 100%; duas 70/30; três 60/25/15, ordenadas da maior para a menor. Elegibilidade especial do goleiro também deve ser registrada na origem. Depois da evolução, recalcular o geral.
- Herança: consumir uma cópia e escolher UMA posição cuja nota original seja superior. A nota atual da principal sobe ATÉ a nota original da doadora. Ex.: atual 75, doadora original 77 → atual 77. Treino e fusões da doadora não são herdados. Ganhos já existentes na principal não são somados duas vezes. Não consome o teto de +8.
- Fusão inferior: consumir quatro cópias do mesmo atleta, sem posição original superior à atual da principal, para +2 em uma posição. Máximo de +8 distribuído pela carta toda, não por posição. Nenhuma posição passa de 99; bloquear operação que desperdiçaria ganho.
- A interpretação da comparação com a nota atual e a prevenção de dupla contagem são escolhas de implementação desta fase, abertas à revisão no teste.
- Forma real recente: +2/0/−2 temporários conforme tendência do app, sem mudar OVR permanente. Fonte indisponível: sem bônus. Estatísticas reais também poderão gerar missões/notícias, sem XP permanente gratuito.
- Cartas vinculadas não podem liberar ganhos para comércio através de uma fusão: principal herda o vínculo de qualquer doadora até o desbloqueio por campanha.

## Partidas

Motor tático automático 2D visto de cima, jogadores e bola em movimento, narração e estatísticas. Formação inicial fixa: GOL, dois DEF, dois ALA/MEI, um ATA. 3–5 minutos reais representam 90 minutos virtuais em dois tempos de 45 e intervalo curto.

Simulação contínua com ajustes táticos livres e ações especiais com tempo de espera. Força depende da posição ocupada, cinco atributos, condição/fôlego, encaixe tático e aleatoriedade controlada. Zebras ocasionais.

Impedimento, faltas, cartões e lesões desde a primeira versão de partidas. Três substituições sem retorno. Lesões raras, normalmente de 1–3 jogos. Vermelho: um jogo de suspensão; três amarelos na competição: um jogo.

Resultado oficial não pode ser refeito. Amistosos PvE livres com recompensas reduzidas/limitadas para evitar repetição infinita lucrativa. Avançar rodada manualmente, sem energia ou espera diária. Motor autoritativo no servidor, eventos persistidos e retomada após desconexão.

## Gestão e economia

Sem dinheiro real. Ganhos por jogos, objetivos, títulos, genéricos vendidos e estádio. Gastos em pacotes, treino, comissão, tratamento e estádio. Sem folha salarial completa inicialmente.

Comissão a partir da Série D, pessoas individuais com contratos por temporada: treinador de goleiros, especialista de bola parada, preparador físico, médico e olheiro. Olheiro direciona recrutamento por BQ/posição. Estádio aumenta renda em casa e dá pequena vantagem limitada.

Guardar histórico detalhado de clube e cartas: jogos, gols, assistências, notas, títulos, recordes e Hall da Fama. Histórico da carta acompanha sua transferência; registros do clube permanecem.

## Mercado e PvP posteriores

Mercado após concluir a Série D inteira: troca de cartas e compra/venda por moeda do jogo. As seis BQ garantidas ficam vinculadas até esse marco. Transferir carta completa com origem, treino, fusões, aparência e histórico.

PvP assíncrono: três partidas oficiais por semana e amistosos livres. Normalizar OVR preservando perfis e diferenças de atributos; fórmula final ainda será desenhada. Não há seis humanos controlando os seis jogadores.

## Fases de entrega

1. **Base técnica e cartas:** conexão entre bases, origem imutável, clube, álbum, pacotes, herança e fusão. Demonstração para revisão, sem economia/campanha automática.
2. **Várzea e gestão:** nove genéricos, desafios, recompensas para seis BQ distintos, treino, condição, economia e histórico. Evitar travar o usuário sem elenco.
3. **Partida 2D:** motor reproduzível, IA, comandos, substituições, impedimento, disciplina, lesões e retomada. Testar equilíbrio.
4. **Série D beta:** dez rodadas, tabela completa, adversários revisados, comissão, estádio e continuidade da campanha. Liberar para poucos jogadores.
5. **Expansões aprovadas:** mata-mata e divisões superiores, copas, internacionais, mercado e PvP.

Cada fase será demonstrada e aprovada antes da próxima. Não apagar o progresso real no fim do beta. Valores de economia, chances de pacotes, fórmulas de treinamento/motor e regulamentos detalhados das expansões permanecem decisões futuras.

## Referências consultadas no planejamento

- [CBF — grupos da Série D 2026](https://www.cbf.com.br/futebol-brasileiro/noticias/detalhes/selecao-brasileira/cbf-divulga-grupos-da-serie-d-de-2026)
- [CBF — calendário nacional](https://www.cbf.com.br/a-cbf/noticias/informes-cbf/a/cbf-anuncia-novo-calendario-do-futebol-profissional-masculino)
- [Wikidata — licença dos dados](https://meta.wikimedia.org/wiki/License)
- [Wikimedia Commons — reutilização de arquivos](https://commons.wikimedia.org/wiki/Commons:REUSE)

O formato do jogo é adaptado, não uma reprodução integral dos regulamentos reais. Consulta pública de um site não é licença automática de importação; revisar fontes profissionais na fase da Série D.
