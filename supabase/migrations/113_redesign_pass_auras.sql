-- Renomeia as auras atuais para refletir os novos efeitos leves e animados.
-- Os asset_keys e IDs permanecem intactos para preservar inventarios,
-- escolhas do Passe e equipamentos ja salvos.

UPDATE public.cosmetic_items
SET name = 'Fumacinha do Churras',
    description = 'Fumacinha leve e confetes da resenha, sem esconder sua moldura.'
WHERE asset_key = 'aura-fumaca-torcida';

UPDATE public.cosmetic_items
SET name = 'Holofote do Craque',
    description = 'Dois fachos claros acompanham o perfil com movimento suave.'
WHERE asset_key = 'aura-refletores-acesos';

UPDATE public.cosmetic_items
SET name = 'Chuva de Jogo',
    description = 'Garoa fina e azul passando discretamente ao redor da foto.'
WHERE asset_key = 'aura-chuva-jogo';

UPDATE public.cosmetic_items
SET name = 'Sinalizador Verde',
    description = 'Dois pontos de luz e pequenas faíscas verdes em movimento.'
WHERE asset_key = 'aura-sinalizador-verde';

UPDATE public.cosmetic_items
SET name = 'Glória da Decisão',
    description = 'Um aro dourado lento para quem resolveu quando valia tudo.'
WHERE asset_key = 'aura-noite-decisao';
