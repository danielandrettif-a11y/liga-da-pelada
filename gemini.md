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
  ADD COLUMN IF NOT EXISTS stadium_map_url TEXT,
  ADD COLUMN IF NOT EXISTS scoring_snapshot JSONB;
```

### Tabela `player_admin_attributes` (Atributos Privados do Administrador)
```sql
CREATE TABLE IF NOT EXISTS public.player_admin_attributes (
  player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
  speed_stars INTEGER NOT NULL CHECK (speed_stars BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.player_admin_attributes ENABLE ROW LEVEL SECURITY;
```

## 4. Regras Comportamentais e Invariantes do Motor BQ v5
1. **Scouts Básicos BQ v5 Unificados**:
   - A pontuação base de atletas no Ranked e no Cartola compartilha exatamente os 8 valores canônicos:
     - Gol: +4.0 | Assistência: +2.5 | Vitória: +3.0 | Empate: +1.0
     - Derrota: -2.5 | Gol contra: -3.0 | Atuação no gol: +2.0 | Gol sofrido no gol: -1.0
   - Toda operação numérica utiliza centésimos inteiros (`Math.round(x * 100)`) para blindar contra desvios de ponto flutuante.
2. **Bônus Posicionais e Teto DEF no Cartola**:
   - A pontuação base do atleta **não** recebe bônus de Clean Sheet (exclusividade da vaga de escalação).
   - Vaga DEF: Clean Sheet (+1.5/jogo sem sofrer gols), Proteção Parcial (+0.5/jogo se sofreu exatamente 1 gol), Muralha (+3.0 se ≥ 3 jogos sem sofrer gols). Teto total do bônus DEF de **10.0 pontos**.
   - Vaga MEI: Bônus de Assistência (+1.0/assist) + Maestro (+3.0 se ≥ 2 assistências).
   - Vaga ATA: Bônus Artilheiro (+3.0 se ≥ 2 gols).
   - Vaga GOL: Bônus Clean Sheet Goleiro (+4.0 se ≥ 1 jogo sem sofrer gols atuando no gol).
   - Capitão: Multiplicador exato de 1.5x aplicado ao total da rodada.
3. **Trava de Segurança no Reprocessamento de Temporada**:
   - Ações e RPCs de reprocessamento (`preview_reprocess_season` e `reprocess_active_season_v5`) são atômicas e **abortam obrigatoriamente** caso exista qualquer rodada `in_progress` ou mercado `open`.
4. **Sorteio por Velocidade e Privacidade**:
   - A avaliação de velocidade (1★ a 3★) é estritamente privada para administradores.
   - Atletas sem avaliação de velocidade registrada são tratados em memória com valor neutro padrão de 2★.
   - O sorteio balanceia os times ordenando por velocidade em serpentina e aplicando minimização de variância via trocas locais.
5. **Compartilhamento do App na Tela Inicial**:
   - Disponibilizar botão de compartilhamento com suporte nativo a Web Share API, WhatsApp e cópia de link para facilitar o engajamento dos atletas.
6. **Exclusão Segura de Rodadas e Pré-listas**:
   - Rodadas em rascunho ou pré-listas (sem partidas finalizadas e sem pontuação travada no Cartola) podem ser excluídas livremente por administradores.
   - A exclusão de uma rodada desvincula com segurança a convocação correspondente, sem ser bloqueada por outras convocações ativas da liga.
7. **Edição de Convocação Aberta**:
   - Administradores podem atualizar Data, Horário e Estádio de uma convocação aberta a qualquer momento.
   - Mudanças na convocação são propagadas para a pré-lista correspondente.
   - O texto de convite do WhatsApp deve sempre conter Data, Horário, Local/Estádio e link do Google Maps.
8. **Coletes Dinâmicos nos Confrontos & Seletor Retraído**:
   - A tela de seleção de confronto (`MatchCreator`) estiliza as caixas dos times com as cores dos coletes definidos (`team.color`).
   - A escolha de coletes na criação de rodadas (`RoundCreator`) deve iniciar recolhida por time e expandir ao clique.
9. **Navegação Instantânea e Loading States**:
   - Todas as rotas de navegação possuem skeletons correspondentes que aparecem no primeiro frame após o clique.
   - A `BottomNav` responde imediatamente ao toque com indicador de transição ativo, sem deixar o usuário em dúvida sobre o clique.
