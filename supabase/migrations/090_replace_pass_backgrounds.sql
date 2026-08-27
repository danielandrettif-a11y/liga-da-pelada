-- Nova coleção de fundos do Passe BQ. Atualiza os registros existentes para
-- preservar inventário, escolhas permanentes e itens já equipados.
UPDATE public.fantasy_cosmetics SET
  slug = 'background-alambrado-noturno', name = 'Alambrado Noturno',
  description = 'A grade, a luz baixa e a quadra pronta para começar.',
  asset_key = 'background-alambrado-noturno', rarity = 'common'
WHERE slug = 'background-gramado-escuro';

UPDATE public.fantasy_cosmetics SET
  slug = 'background-vestiario-concreto', name = 'Vestiário de Concreto',
  description = 'Banco, armário e concentração antes do apito.',
  asset_key = 'background-vestiario-concreto', rarity = 'common'
WHERE slug = 'background-vestiario';

UPDATE public.fantasy_cosmetics SET
  slug = 'background-garoa-refletores', name = 'Garoa sob Refletores',
  description = 'Chuva fina, quadra molhada e jogo que não para.',
  asset_key = 'background-garoa-refletores', rarity = 'rare'
WHERE slug = 'background-chuva-estadio';

UPDATE public.fantasy_cosmetics SET
  slug = 'background-gramado-bairro', name = 'Gramado de Bairro',
  description = 'Cal, grama e o campo que conhece cada resenha.',
  asset_key = 'background-gramado-bairro', rarity = 'rare'
WHERE slug = 'background-varzea-noturna';

UPDATE public.fantasy_cosmetics SET
  slug = 'background-arquibancada-vazia', name = 'Arquibancada Vazia',
  description = 'O silêncio antes da torcida tomar conta.',
  asset_key = 'background-arquibancada-vazia', rarity = 'common'
WHERE slug = 'background-quadra-vazia';

UPDATE public.fantasy_cosmetics SET
  slug = 'background-por-do-sol-quadra', name = 'Pôr do Sol na Quadra',
  description = 'A última luz do dia para fechar mais uma pelada.',
  asset_key = 'background-por-do-sol-quadra', rarity = 'rare'
WHERE slug = 'background-fim-de-tarde';

NOTIFY pgrst, 'reload schema';
