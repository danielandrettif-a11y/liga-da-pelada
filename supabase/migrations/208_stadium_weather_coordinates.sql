ALTER TABLE public.stadiums
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT stadium_weather_coordinates_pair
    CHECK ((latitude IS NULL) = (longitude IS NULL));

UPDATE public.stadiums
SET latitude = -21.779993,
    longitude = -41.3018074,
    updated_at = now()
WHERE id = '4b027e39-7ee5-4045-8abd-032fab5874c9';
