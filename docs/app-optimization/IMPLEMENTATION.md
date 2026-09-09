# Implementação da otimização

1. Corrigir dependências e criar CI obrigatória.
2. Medir erros e Web Vitals por logs estruturados/webhook opcional.
3. Cachear apenas leituras públicas e históricas, com TTL curto e invalidação.
4. Reduzir bytes de avatares e CSS/JavaScript específico do Cartola.
5. Criar read models RPC para diminuir viagens ao banco sem alterar mutações.
6. Automatizar tipos do Supabase e cenários E2E com ambiente isolado.

## Critérios de aceite

- `npm run typecheck`, `npm test` e `npm run build` passam.
- Auditoria não contém vulnerabilidade alta/crítica de produção.
- O funcionamento atual é mantido quando uma migration nova ainda não foi aplicada.
- O teste E2E nunca altera dados reais sem credenciais explícitas de teste.
