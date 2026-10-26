const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Stadium = {
  id: string;
  league_id: string;
  name: string;
  address: string | null;
  google_maps_url: string;
  latitude: number | null;
  longitude: number | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StadiumInput = {
  name: string;
  address: string | null;
  googleMapsUrl: string;
  latitude: number | null;
  longitude: number | null;
};

export class InvalidStadiumError extends Error {
  constructor(message = "Estádio inválido.") {
    super(message);
    this.name = "InvalidStadiumError";
  }
}

export function parseStadiumId(value: string): string {
  if (!UUID.test(value)) throw new InvalidStadiumError();
  return value.toLowerCase();
}

export function parseStadiumInput(input: {
  name: string;
  address?: string | null;
  google_maps_url: string;
  latitude?: number | null;
  longitude?: number | null;
}): StadiumInput {
  const name = input.name.trim();
  const address = input.address?.trim() || null;
  let googleMapsUrl = input.google_maps_url.trim();
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  if (!name) throw new InvalidStadiumError("Informe o nome do estádio/campo.");
  if (!googleMapsUrl) throw new InvalidStadiumError("Informe o link do Google Maps para localização.");
  if ((latitude === null) !== (longitude === null)) {
    throw new InvalidStadiumError("Informe latitude e longitude juntas para ativar a previsão do tempo.");
  }
  if (latitude !== null && longitude !== null
    && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    throw new InvalidStadiumError("Latitude ou longitude inválida.");
  }
  if (!googleMapsUrl.startsWith("http://") && !googleMapsUrl.startsWith("https://")) {
    googleMapsUrl = `https://${googleMapsUrl}`;
  }
  return { name, address, googleMapsUrl, latitude, longitude };
}

export function parseStadiumOrder(ids: string[]): string[] {
  const parsed = ids.map(parseStadiumId);
  if (new Set(parsed).size !== parsed.length) throw new InvalidStadiumError("A ordem contém estádios repetidos.");
  return parsed;
}
