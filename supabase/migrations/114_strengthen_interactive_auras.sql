-- Atualiza os nomes e descricoes para a segunda versao das auras animadas.
-- IDs e asset_keys permanecem iguais para preservar inventarios e loadouts.

UPDATE public.fantasy_cosmetics
SET name = 'Fumaça da Resenha',
    description = 'Névoa atravessando a foto e escapando pelas laterais da moldura.'
WHERE asset_key = 'aura-fumaca-torcida';

UPDATE public.fantasy_cosmetics
SET name = 'Holofote do Craque',
    description = 'Fachos claros passeando pela foto e iluminando a moldura.'
WHERE asset_key = 'aura-refletores-acesos';

UPDATE public.fantasy_cosmetics
SET name = 'Chuva de Jogo',
    description = 'Chuva animada atravessando foto, moldura e gramado.'
WHERE asset_key = 'aura-chuva-jogo';

UPDATE public.fantasy_cosmetics
SET name = 'Radar do Olheiro',
    description = 'Um radar verde procura talento dentro e ao redor da foto.'
WHERE asset_key = 'aura-sinalizador-verde';

UPDATE public.fantasy_cosmetics
SET name = 'Glória da Decisão',
    description = 'Luz dourada atravessando a foto com estrelas em órbita.'
WHERE asset_key = 'aura-noite-decisao';
