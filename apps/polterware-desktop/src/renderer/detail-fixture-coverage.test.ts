import { describe, expect, it } from "vitest";
import { CATALOG_PROVIDER_NAMES } from "./workspace/test-fixtures";

describe("local workspace test fixtures", () => {
  it("keeps the nine catalog providers", () => {
    expect([...CATALOG_PROVIDER_NAMES]).toEqual([
      "GitHub",
      "GitLab",
      "AWS",
      "Google Cloud",
      "Azure",
      "Vercel",
      "Supabase",
      "Terraform",
      "Docker",
    ]);
  });
});
