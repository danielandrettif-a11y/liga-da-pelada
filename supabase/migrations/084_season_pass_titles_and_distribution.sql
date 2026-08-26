-- Atualiza a trilha do Passe com os novos títulos e mais escolhas cosméticas.
-- Não remove recompensas nem cosméticos já resgatados pelos usuários.

INSERT INTO public.fantasy_cosmetics (slug, slot, rarity, name, description, asset_key) VALUES
  ('title-alergico-a-gol', 'title', 'common', 'Alérgico a Gol', 'Chega perto, mas o gol nunca vem.', 'title-alergico-gol'),
  ('title-inimigo-da-marcacao', 'title', 'common', 'Inimigo da Marcação', 'A marcação tenta, mas não acompanha.', 'title-inimigo-marcacao'),
  ('title-canela-de-vidro', 'title', 'common', 'Canela de Vidro', 'Qualquer dividida vira novela.', 'title-canela-vidro'),
  ('title-craque-do-aquecimento', 'title', 'common', 'Craque do Aquecimento', 'O melhor futebol antes do apito.', 'title-aquecimento'),
  ('title-pele-do-alongamento', 'title', 'rare', 'Pelé do Alongamento', 'Flexibilidade de campeão, bola nem tanto.', 'title-alongamento'),
  ('title-especialista-em-quase-gol', 'title', 'rare', 'Especialista em Quase Gol', 'A trave conhece seu nome.', 'title-quase-gol'),
  ('title-5-minutos-alta-intensidade', 'title', 'rare', '5 Minutos de Alta Intensidade', 'Explode no começo e administra o resto.', 'title-alta-intensidade'),
  ('title-driblador-culposo', 'title', 'rare', 'Driblador Culposo', 'Foi sem querer, mas passou por três.', 'title-driblador-culposo'),
  ('title-cardio-em-construcao', 'title', 'rare', 'Cardio em Construção', 'Cada corrida é um investimento.', 'title-cardio'),
  ('title-marcacao-wifi', 'title', 'rare', 'Marcação Wi-Fi', 'Conecta quando dá sinal.', 'title-marcacao-wifi'),
  ('title-presenca-confirmada', 'title', 'epic', 'Presença Confirmada, Futebol Não', 'O importante é prestigiar.', 'title-presenca'),
  ('title-titular-por-falta-de-opcao', 'title', 'epic', 'Titular por Falta de Opção', 'Escalado pela matemática do elenco.', 'title-titular-opcao'),
  ('title-overall-questionavel', 'title', 'epic', 'Overall Questionável', 'Os números pedem uma segunda opinião.', 'title-overall-questionavel'),
  ('title-contratacao-por-dvd', 'title', 'epic', 'Contratação por DVD', 'O vídeo prometia muito mais.', 'title-contratacao-dvd'),
  ('frame-linha-lateral', 'frame', 'common', 'Linha Lateral', 'A moldura de quem joga no limite.', 'frame-linha-lateral'),
  ('frame-grama-raiz', 'frame', 'rare', 'Grama Raiz', 'Textura de campo e resenha.', 'frame-grama-raiz'),
  ('background-quadra-vazia', 'background', 'common', 'Quadra Vazia', 'O palco antes da turma chegar.', 'background-quadra-vazia'),
  ('background-fim-de-tarde', 'background', 'rare', 'Fim de Tarde', 'Luz dourada para a próxima partida.', 'background-fim-tarde'),
  ('aura-luz-de-quadra', 'aura', 'common', 'Luz de Quadra', 'Brilho de quem não falta.', 'aura-luz-quadra'),
  ('nameplate-varzea-raiz', 'nameplate', 'rare', 'Várzea Raiz', 'Seu nome com cheiro de campo.', 'nameplate-varzea-raiz'),
  ('banner-concreto-verde', 'banner', 'rare', 'Concreto Verde', 'Arquibancada, quadra e identidade BQ.', 'banner-concreto-verde')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  asset_key = EXCLUDED.asset_key;

-- As três recompensas antigas de título continuam com os mesmos IDs.
DELETE FROM public.fantasy_season_pass_reward_options
WHERE reward_id IN (
  SELECT id FROM public.fantasy_season_pass_rewards
  WHERE reward_key IN ('pass-title-01', 'pass-title-02', 'pass-title-03')
);

INSERT INTO public.fantasy_season_pass_rewards (fantasy_season_id, house, reward_key, status, reward_type, card_tier)
SELECT fs.id, reward.house, reward.reward_key, 'development', 'cosmetic_choice', NULL
FROM public.fantasy_seasons fs
CROSS JOIN (VALUES
  (8, 'pass-title-04'),
  (14, 'pass-title-05'),
  (22, 'pass-title-06'),
  (35, 'pass-title-07'),
  (18, 'pass-frame-03'),
  (23, 'pass-background-03'),
  (27, 'pass-aura-03'),
  (32, 'pass-nameplate-03'),
  (38, 'pass-banner-03')
) AS reward(house, reward_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fantasy_season_pass_rewards existing
  WHERE existing.fantasy_season_id = fs.id AND existing.reward_key = reward.reward_key
);

INSERT INTO public.fantasy_season_pass_reward_options (reward_id, cosmetic_id)
SELECT reward.id, cosmetic.id
FROM public.fantasy_season_pass_rewards reward
JOIN public.fantasy_cosmetics cosmetic ON cosmetic.slug = ANY (CASE reward.reward_key
  WHEN 'pass-title-01' THEN ARRAY['title-alergico-a-gol', 'title-inimigo-da-marcacao']
  WHEN 'pass-title-02' THEN ARRAY['title-cardio-em-construcao', 'title-marcacao-wifi']
  WHEN 'pass-title-03' THEN ARRAY['title-overall-questionavel', 'title-contratacao-por-dvd']
  WHEN 'pass-title-04' THEN ARRAY['title-canela-de-vidro', 'title-craque-do-aquecimento']
  WHEN 'pass-title-05' THEN ARRAY['title-pele-do-alongamento', 'title-especialista-em-quase-gol']
  WHEN 'pass-title-06' THEN ARRAY['title-5-minutos-alta-intensidade', 'title-driblador-culposo']
  WHEN 'pass-title-07' THEN ARRAY['title-presenca-confirmada', 'title-titular-por-falta-de-opcao']
  WHEN 'pass-frame-03' THEN ARRAY['frame-linha-lateral', 'frame-grama-raiz']
  WHEN 'pass-background-03' THEN ARRAY['background-quadra-vazia', 'background-fim-de-tarde']
  WHEN 'pass-aura-03' THEN ARRAY['aura-luz-de-quadra', 'aura-energia-bq']
  WHEN 'pass-nameplate-03' THEN ARRAY['nameplate-varzea-raiz', 'nameplate-prancheta']
  WHEN 'pass-banner-03' THEN ARRAY['banner-concreto-verde', 'banner-torcida-bq']
  ELSE ARRAY[]::TEXT[] END)
ON CONFLICT DO NOTHING;
