# Constituição do Projeto: Liga da Pelada

## 1. Visão do Sistema
Plataforma determinística e intuitiva para gestão de peladas semanais, com convocações públicas, formação de times, ranking histórico e Fantasy Game (Cartola).

## 2. Invariantes Arquiteturais
- **Backend / Persistência**: Supabase (PostgreSQL + RLS + RPCs determinísticas).
- **Frontend / SSR**: Next.js App Router (React 19 + TypeScript + Tailwind CSS).
- **Camada de Ação**: Server Actions determinísticas em `src/lib/actions/`.
- **Arquitetura 3-Camadas**:
  - Camada 1: Diretrizes e POPs de regras de negócio.
  - Camada 2: Orquestração e roteamento de dados.
  - Camada 3: Execução determinística (ações e RPCs).

## 3. Esquemas de Dados e Migrations

### Tabela `stadiums` (Campos de Futebol / Locais)
```sql
CREATE TABLE IF NOT EXISTS public.stadiums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  google_maps_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Campos em `callups` (Convocação)
```sql
ALTER TABLE public.callups
  ADD COLUMN IF NOT EXISTS start_time TIME WITHOUT TIME ZONE DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS stadium_id UUID REFERENCES public.stadiums(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stadium_name TEXT,
  ADD COLUMN IF NOT EXISTS stadium_map_url TEXT;
```

### Campos em `rounds` (Rodadas)
```sql
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS stadium_id UUID REFERENCES public.stadiums(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stadium_name TEXT,
  ADD COLUMN IF NOT EXISTS stadium_map_url TEXT;
```

## 4. Regras Comportamentais
1. **Banner de Convocação na Home**:
   - Se o usuário NÃO confirmou e há vagas normais: Apresentar chamada para confirmação de presença.
   - Se o usuário NÃO confirmou e vagas normais estão cheias: Apresentar chamada para "Entrar na Lista de Espera".
   - Se o usuário JÁ confirmou: Apresentar estado de presença confirmada com mensagem positiva e link para gerenciar.
   - Se o usuário está na lista de espera: Apresentar posição na fila de espera.
   - Fornecer botão direto de "Ver onde fica" (Google Maps) quando houver local configurado.
2. **Aba de Convocação (`/convocacao`)**:
   - Exibir com destaque: **Dia**, **Horário** e **Estádio / Local com Link**.
   - Texto de convite WhatsApp gerado com dia, horário, local (com link) e URL de confirmação.
3. **Cartola - Ranking da Rodada (`/cartola/ranking?scope=round`)**:
   - Durante o período de mercado/escalação: Exibir lista de quem já salvou o time (confirmados) e quem ainda não escalou (pendentes).
   - Após a rodada encerrada: Exibir a pontuação habitual da rodada.
4. **Gestão de Estádios (`/mais/estadios`)**:
   - Aba em "Mais" para listar, cadastrar, editar, excluir e reordenar estádios com links do Google Maps.
   - Ordem definida nesta aba deve ser a mesma exibida nos selects de criação de rodada e abertura de convocação.
