import { describe, expect, it } from "vitest";
import { shouldOpenCreateProject } from "./first-project";

describe("shouldOpenCreateProject", () => {
  it("opens the create-project dialog when the core is available and no projects exist", () => {
    expect(shouldOpenCreateProject({ coreAvailable: true, projectCount: 0 })).toBe(true);
  });

  it("keeps the current surface when projects exist", () => {
    expect(shouldOpenCreateProject({ coreAvailable: true, projectCount: 1 })).toBe(false);
  });

  it("does not open the create-project dialog when the core is unavailable", () => {
    expect(shouldOpenCreateProject({ coreAvailable: false, projectCount: 0 })).toBe(false);
  });
});
