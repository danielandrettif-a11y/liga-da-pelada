import { describe, expect, it } from "vitest";
import { parseStadiumInput, parseStadiumOrder } from "./stadium.js";

describe("stadium domain", () => {
  it("normalizes venue data and optional coordinates", () => {
    expect(parseStadiumInput({
      name: " Arena BQ ", address: " Rua 1 ", google_maps_url: "maps.example/arena",
      latitude: -21.7, longitude: -41.3,
    })).toEqual({
      name: "Arena BQ", address: "Rua 1", googleMapsUrl: "https://maps.example/arena",
      latitude: -21.7, longitude: -41.3,
    });
  });

  it("rejects missing fields, incomplete coordinates and duplicate order", () => {
    expect(() => parseStadiumInput({ name: "", google_maps_url: "maps.example" })).toThrow("nome");
    expect(() => parseStadiumInput({ name: "Arena", google_maps_url: "", latitude: null, longitude: null })).toThrow("Google Maps");
    expect(() => parseStadiumInput({ name: "Arena", google_maps_url: "maps.example", latitude: -21, longitude: null })).toThrow("juntas");
    const id = "00000000-0000-4000-8000-000000000001";
    expect(() => parseStadiumOrder([id, id])).toThrow("repetidos");
  });
});
