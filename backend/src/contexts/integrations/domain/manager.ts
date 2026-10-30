export interface ClubIdentity {
  name: string;
  abbreviation: string;
  color: string;
  crest?: "shield" | "round";
  kit?: "solid" | "stripes";
}

export type ManagerCommand =
  | { type: "open-pack"; packId: string }
  | { type: "claim-card"; packId: string; cardId: string }
  | { type: "fuse"; cardIds: string[] }
  | { type: "custom"; action: string; payload?: any };

export interface ManagerSave {
  version: number;
  state: any;
}

export interface ManagerResult {
  ok: boolean;
  message: string;
  save?: ManagerSave;
}

export function validateClubIdentity(identity: Partial<ClubIdentity>): { valid: boolean; error?: string } {
  if (!identity.name || identity.name.trim().length < 2) {
    return { valid: false, error: "Nome do clube deve ter pelo menos 2 caracteres." };
  }
  if (!identity.abbreviation || identity.abbreviation.trim().length < 2) {
    return { valid: false, error: "Sigla do clube deve ter pelo menos 2 caracteres." };
  }
  return { valid: true };
}
