# Descobertas e Decisões Técnicas: Melhorias de Cosméticos

## 1. Corte de Molduras no `PlayerAvatar`
- **Causa raiz:** O container principal do `PlayerAvatar` combinava `overflow-hidden` e `rounded-full` no mesmo elemento onde o `CosmeticFrameOverlay` e anéis eram aplicados. Como a imagem precisava ser recortada em círculo, qualquer elemento filho com `inset-0` ou borda externa ficava restrito à mesma máscara circular exata.
- **Solução arquitetural:** Separar a estrutura em 2 camadas:
  1. Wrapper externo (sem `overflow-hidden`), responsável por dimensões, flex, eventos de clique, acessibilidade e posicionamento relativo.
  2. Container interno da foto com `overflow-hidden rounded-[inherit]`, contendo a imagem e zoom hover.
  3. Overlay da moldura como irmão do container interno, com `absolute -inset-[4px]` (ou `-inset-[5px]` para avatares maiores) e `z-10`, permitindo que os ornamentos da moldura transbordem suavemente além do raio da foto.

## 2. Enquadramento de Capas e Fundos no Mobile
- **Causa raiz:** `backgroundPosition: "center"` em telas verticais (smartphones) foca na porção vertical média da imagem, cortando o céu/refletores/cenários na parte superior dos fundos e elementos de destaque nas capas.
- **Solução arquitetural:** Introduzir `cosmeticBackgroundPosition` com padrão `center top` para fundos de página/cenário e `center 20%` para banners/capas, além de expandir a altura dos cards de coleção para `h-32`.
