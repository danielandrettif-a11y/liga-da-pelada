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
- **Invariantes de Performance (V1)**:
  - Feedback visual imediato ao toque (<100ms) em todos os links e BottomNav.
  - Skeletons dedicados por rota (`loading.tsx`) replicando fielmente a geometria do layout sem CLS (Cumulative Layout Shift).
  - Consultas pontuais (Single Player) no lugar de carregar todo o elenco para ler dados individuais.
  - Streaming com Suspense em seções secundárias e cache inteligente com revalidação direcionada.

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
1. **Compartilhamento do App na Tela Inicial**:
   - Disponibilizar botão de compartilhamento com suporte nativo a Web Share API, WhatsApp e cópia de link para facilitar o engajamento dos atletas.
2. **Exclusão Segura de Rodadas e Pré-listas**:
   - Rodadas em rascunho ou pré-listas (sem partidas finalizadas e sem pontuação travada no Cartola) podem ser excluídas livremente por administradores.
   - A exclusão de uma rodada desvincula com segurança a convocação correspondente, sem ser bloqueada por outras convocações ativas da liga.
3. **Edição de Convocação Aberta**:
   - Administradores podem atualizar Data, Horário e Estádio de uma convocação aberta a qualquer momento.
   - Mudanças na convocação são propagadas para a pré-lista correspondente.
   - O texto de convite do WhatsApp deve sempre conter Data, Horário, Local/Estádio e link do Google Maps.
4. **Coletes Dinâmicos nos Confrontos & Seletor Retraído**:
   - A tela de seleção de confronto (`MatchCreator`) estiliza as caixas dos times com as cores dos coletes definidos (`team.color`).
   - A escolha de coletes na criação de rodadas (`RoundCreator`) deve iniciar recolhida por time e expandir ao clique.
5. **Navegação Instantânea e Loading States**:
   - Todas as rotas de navegação possuem skeletons correspondentes que aparecem no primeiro frame após o clique.
   - A `BottomNav` responde imediatamente ao toque com indicador de transição ativo, sem deixar o usuário em dúvida sobre o clique.
