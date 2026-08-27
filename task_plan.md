# Plano de Execução: Melhorias de Cosméticos (Frames, Capas e Fundos)

## Objetivo
Corrigir o corte das molduras (`CosmeticFrameOverlay`) em torno das fotos de jogadores (`PlayerAvatar`) e aprimorar o enquadramento de capas (banners) e fundos em telas mobile e na coleção de cosméticos.

---

## Matriz de Mudanças

| Recurso | Problema Atual | Solução Proposta | Status |
|---|---|---|---|
| **Moldura do Avatar** | `PlayerAvatar` com `overflow-hidden` direto no container pai ceifa a moldura; moldura usa `inset-0` | Desacoplar a foto com `overflow-hidden` do container da moldura; aplicar `-inset-[4px]` a `-inset-[5px]` no overlay | Concluído ✅ |
| **Capas e Fundos** | `backgroundPosition: "center"` no mobile corta o topo (foco dos refletores/cenários) | Helper `cosmeticBackgroundPosition` (`center top` para fundos, `center 20%` para capas com overrides pontuais) | Concluído ✅ |
| **Cards da Coleção** | Altura `h-24` limita a visualização das artes | Expandir para `h-32` e aplicar posicionamento inteligente | Concluído ✅ |
| **Carta do Ranking** | Container externo com `overflow-hidden` corta a moldura do avatar | Remover `overflow-hidden` do wrapper no modal de ranking | Concluído ✅ |

---

## Fases de Execução

- [x] **Fase 1: Diagnóstico e Análise Técnica**
- [x] **Fase 2: Utilitário de Posição de Cosméticos (`cosmetics.ts`)**
- [x] **Fase 3: Refatoração do `PlayerAvatar.tsx` (Desacoplamento de Overflow)**
- [x] **Fase 4: Ajustes em `CosmeticsExperience.tsx` (Preview Hero, Coleção `h-32`)**
- [x] **Fase 5: Ajustes nas Páginas de Perfil e Carta (`jogadores/[id]`, `carta`, `RankingPlayerCardModal`)**
- [x] **Fase 6: Verificação de Build e Testes Visuais**
