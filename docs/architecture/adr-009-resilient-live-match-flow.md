# ADR 009 — Fluxo Ao Vivo transacional e resiliente

## Contexto

Durante a partida, a conexão móvel pode oscilar exatamente entre o commit no
banco e a resposta ao navegador. Repetir uma mutação sem identidade pode criar
uma segunda partida ou duplicar um gol; esperar alertas externos e invalidações
de cache também aumenta a latência percebida do toque.

## Decisão

- A migration 334 cria a partida, escalação, goleiros, períodos no gol, início
  do cronômetro e ativação da rodada em uma única RPC PostgreSQL.
- A intenção de abertura recebe uma chave de idempotência estável. Repetir a
  mesma chave e conteúdo devolve o mesmo recibo; reutilizá-la com outro conteúdo
  é rejeitado. O bloqueio da rodada serializa ADMs concorrentes.
- Alertas de cronômetro e invalidações de outras telas acontecem depois da
  resposta. Falha do provedor de alertas não desfaz uma partida já válida.
- `register_goal` continua sendo a autoridade única para autorização, evento,
  placar e idempotência. A verificação redundante anterior à RPC foi removida.
- Gols e assistências usam uma outbox local, isolada por conta e partida. O
  lance aparece imediatamente como pendente, mantém a mesma chave em todos os
  retries e só é retirado da fila após recibo ou confirmação pelo Realtime.
- Falha PostgreSQL com código é definitiva; falha de transporte é incerta e
  recebe retry exponencial. A partida não pode ser encerrada com fila pendente.

## Consequências

- Abrir a partida exige aplicar a migration 334 antes do código de aplicação.
- O app tolera perda de resposta e queda/reentrada de rede sem duplicar gols.
- A outbox é deliberadamente limitada a gols/assistências. Encerramento e
  correções administrativas continuam online para evitar conflitos complexos.
- O feedback visual não depende do tempo de rede, mas a confirmação continua
  explicitamente marcada; o app não chama um lance local de confirmado.
- A implantação deve passar primeiro pelo Supabase de teste, incluindo duas
  chamadas simultâneas, retry com a mesma chave e queda após o envio.

