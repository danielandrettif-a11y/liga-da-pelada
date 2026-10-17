# ADR 001 — Monólito modular com DDD pragmático

**Estado:** aceito em 2026-10-17.

## Contexto

O app Next.js/Supabase reúne regras, consultas e efeitos de interface em Server Actions extensas. Mudanças em um fluxo podem afetar outros. Há regras transacionais e de segurança já implementadas em funções SQL e RLS; reescrevê-las aumentaria o risco.

## Decisão

Migrar por fatias verticais para módulos de domínio, aplicação e infraestrutura. Server Actions continuam como adaptadores públicos finos, preservando assinaturas, autenticação, revalidação e navegação. Usar portas/interfaces somente para operações complexas ou onde testes e desacoplamento tragam benefício claro. Manter SQL/RPCs como autoridade nas operações transacionais.

## Alternativas e trocas

- Reescrita completa em DDD formal: limites mais rígidos, mas custo, boilerplate e risco de regressão altos para a equipe e a base atuais.
- Continuar apenas repartindo arquivos de actions: menor esforço inicial, mas mantém regras misturadas e dependências cruzadas.
- Monólito modular gradual (escolhido): facilita manutenção e teste sem migração arriscada de banco; exige convívio temporário entre fluxos antigos e novos.

## Consequências

Cada lote deve cobrir comportamento atual antes da extração e registrar progresso. Não aplicar cache compartilhado a consultas dependentes de conta/cookies sem chave e invalidação seguras. Reavaliar interfaces ou tabela de acumulados quando medições e complexidade real justificarem.
