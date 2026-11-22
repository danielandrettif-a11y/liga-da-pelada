import { describe, expect, it } from "vitest";
import { supabaseServerConfig } from "./server-config";

describe("supabaseServerConfig", () => {
  it("uses the public URL's cookie namespace when connecting internally", () => {
    expect(supabaseServerConfig("http://127.0.0.1:8000", "http://supabase-envoy:8000"))
      .toEqual({ url: "http://supabase-envoy:8000", cookieName: "sb-127-auth-token" });
  });

  it("uses the public URL when no internal URL is configured", () => {
    expect(supabaseServerConfig("https://project.supabase.co"))
      .toEqual({ url: "https://project.supabase.co", cookieName: "sb-project-auth-token" });
  });
});
