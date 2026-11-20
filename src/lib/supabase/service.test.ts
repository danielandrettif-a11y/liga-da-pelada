import { afterEach, describe, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient }));
import { createServiceClient } from "./service";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("createServiceClient", () => {
  it("uses the internal gateway for server-side calls", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:8000");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "http://supabase-envoy:8000");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    createServiceClient();
    expect(createClient).toHaveBeenCalledWith("http://supabase-envoy:8000", "service-key", expect.any(Object));
  });
});
