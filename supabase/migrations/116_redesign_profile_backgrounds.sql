-- Renova a direção visual dos fundos sem trocar IDs ou asset_keys. Dessa
-- forma, itens já conquistados/equipados recebem a nova arte automaticamente.
UPDATE public.fantasy_cosmetics
SET name = CASE asset_key
    WHEN 'background-alambrado-noturno' THEN 'Manhã no Campinho'
    WHEN 'background-vestiario-concreto' THEN 'Vestiário da Resenha'
    WHEN 'background-garoa-refletores' THEN 'Depois da Chuva'
    WHEN 'background-gramado-bairro' THEN 'Domingo de Sol'
    WHEN 'background-arquibancada-vazia' THEN 'Torcida Chegando'
    WHEN 'background-por-do-sol-quadra' THEN 'Luzes da Pelada'
    ELSE name
  END,
  description = CASE asset_key
    WHEN 'background-alambrado-noturno' THEN 'O campinho acordou claro e pronto para a primeira bola.'
    WHEN 'background-vestiario-concreto' THEN 'Chinelo, cooler e a resenha que nunca acaba.'
    WHEN 'background-garoa-refletores' THEN 'A chuva passou e deixou a quadra brilhando.'
    WHEN 'background-gramado-bairro' THEN 'Sol, bandeirinhas e grama esperando a turma.'
    WHEN 'background-arquibancada-vazia' THEN 'As cores já chegaram antes da torcida.'
    WHEN 'background-por-do-sol-quadra' THEN 'Fim de tarde, luzes acesas e clima de decisão.'
    ELSE description
  END
WHERE asset_key IN (
  'background-alambrado-noturno',
  'background-vestiario-concreto',
  'background-garoa-refletores',
  'background-gramado-bairro',
  'background-arquibancada-vazia',
  'background-por-do-sol-quadra'
);
