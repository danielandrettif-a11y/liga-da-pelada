# Auditoria de balanceamento do Cartola

Esta auditoria foi desenhada para medir o sistema atual com dados reais sem alterar o banco. Ela entrega notas de 0 a 10 para GOL, DEF, MEI e ATA, uma nota do sistema de pontuação, uma nota do Cartola completo e uma proposta numérica simulada.

## Estado da entrega

- A consulta de extração está em `scripts/audit-cartola-balance.sql`.
- O analisador está em `scripts/analyze-cartola-balance.mjs`.
- Nenhuma migration foi criada.
- Nenhuma regra foi aplicada em produção.
- A nota final baseada em dados reais depende da execução da consulta no Supabase e do arquivo exportado.

## Regras encontradas no projeto

| Bloco | Regra atual |
|---|---:|
| Gol-base | +5 |
| Assistência-base | +3 |
| Vitória | +4 |
| Derrota | -2 |
| Atuação no gol | +3 |
| Gol sofrido pelo goleiro | -1 |
| Gol contra | -3 |
| Capitão | 1,5x no pacote base + posição |
| Palpite de artilheiro | até +8 |
| Palpite de garçom | até +6 |
| GOL | +4 por clean sheet real, acumulável por jogo no gol |
| DEF | base +2/+1 e vaga +2/+1 para clean/um gol sofrido |
| MEI | assistência completa +4; Maestro +3 com duas ou mais |
| ATA | Artilheiro +3 com dois ou mais gols |

A Rodada 1 é tratada como legado. O sistema de vagas, posições e mercado por perfil entra da Rodada 2 em diante.

## Como coletar os dados

1. Abra o SQL Editor do Supabase.
2. Cole e execute todo o conteúdo de `scripts/audit-cartola-balance.sql`.
3. O resultado terá uma única célula chamada `audit_payload`.
4. Copie o JSON dessa célula para um arquivo chamado `cartola-audit.json` na raiz do projeto.

A consulta contém apenas `SELECT` e CTEs. Ela não cria função, tabela temporária ou migration e não executa `INSERT`, `UPDATE` ou `DELETE`.

O arquivo exportado não contém UUIDs, nomes, apelidos, e-mails, avatares ou textos livres. Gestores e atletas recebem números pseudônimos válidos apenas dentro daquele arquivo.

## Como gerar o relatório

```powershell
npm run audit:cartola -- cartola-audit.json cartola-balance-report.md
```

Para conferir o analisador sem dados do Supabase:

```powershell
npm run audit:cartola:self-test
```

## O que o analisador valida

Antes de dar notas, ele recompõe cada valor armazenado:

```text
base pura + bônus de posição + bônus do capitão = total do atleta
soma dos atletas = player_points da escalação
artilheiro + garçom + desafio = prediction_points
atletas + prediction_points + carta = total da escalação
```

No schema atual, `fantasy_lineup_players.base_points` já contém o bônus da vaga. Por isso a consulta exporta a base pura como `base_points - position_bonus`.

## Metodologia das notas

Cada posição usa os pesos acordados:

| Critério | Peso |
|---|---:|
| Retorno médio normalizado por atleta e partida | 30% |
| Frequência real das oportunidades | 25% |
| Teto e volatilidade | 20% |
| Neutralidade entre formações | 15% |
| Clareza e resistência a vantagens indevidas | 10% |

O sistema de pontuação usa posições 50%, capitão/palpites 20%, formações 20% e consistência 10%.

O Cartola completo usa pontuação 35%, mercado/patrimônio 20%, escalação/clareza 20%, experiência/rankings 15% e integridade/testes 10%.

## Simulação do rebalanceamento

O analisador reprocessa virtualmente apenas as rodadas em que o sistema de posições estava ativo. A Rodada 1 permanece igual. Cartas e desafios também são preservados; a busca pode ajustar somente os palpites de artilheiro e garçom.

A busca compara alternativas próximas das regras atuais e penaliza propostas que não alcancem:

- diferença máxima de 15% no retorno esperado por vaga;
- diferença máxima de 20% no P90;
- vantagem estrutural inferior a 5% entre `2-1-2` e `2-2-1`.

O relatório mostra os valores atuais e propostos, o impacto anônimo na classificação histórica e a confiança da amostra. Uma recomendação com confiança baixa não deve ser transformada em migration sem acumular mais rodadas.

## Auditoria preliminar de arquitetura

Pontos fortes já verificáveis sem o arquivo real:

- snapshots preservam as regras de cada rodada;
- o cálculo do capitão inclui o pacote da posição de forma consistente;
- o mercado usa 65% do percentil da posição e 35% do geral;
- cartas são isoladas da valorização;
- tamanho da escalação é congelado por rodada;
- o banco exige time completo e capitão nas rodadas futuras;
- há cálculo compartilhado de prévia e final no código da aplicação.

Riscos que a etapa estatística precisa quantificar:

- DEF recebe proteção na base e novamente na vaga correta;
- GOL pode acumular clean sheets quando há rodízio;
- MEI combina assistência de 4 pontos com o degrau do Maestro;
- ATA depende de um evento mais raro para receber o bônus exclusivo;
- capitão e dois palpites podem concentrar uma parcela alta do total;
- as constantes de posição existem tanto em TypeScript quanto em SQL, aumentando o custo de manutenção e o risco de divergência futura.

