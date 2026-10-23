import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDesktopUpdater } from "../../../../tooling/updater/runtime";

const native = vi.hoisted(() => ({
  start: vi.fn(() => true), check: vi.fn(), isInstalling: vi.fn(() => false), load: vi.fn(),
}));
vi.mock("node:module", () => ({ createRequire: () => native.load }));
beforeEach(() => {
  vi.clearAllMocks();
  native.start.mockReturnValue(true);
  native.isInstalling.mockReturnValue(false);
  native.load.mockReturnValue(native);
});

describe("desktop Sparkle updater", () => {
  it("does not load native code or check updates in development", () => {
    const showError = vi.fn();
    const updater = createDesktopUpdater({ isPackaged: false, resourcesPath: "/resources", showError });
    updater.start();
    updater.check();
    expect(updater.status()).toBe("disabled");
    expect(native.load).not.toHaveBeenCalled();
    expect(updater.menuItem().enabled).toBe(false);
    expect(showError).toHaveBeenCalled();
  });

  it.skipIf(process.platform !== "darwin")("starts once and forwards manual checks and installation state", () => {
    const updater = createDesktopUpdater({ isPackaged: true, resourcesPath: "/resources", showError: vi.fn() });
    updater.start();
    updater.start();
    updater.check();
    expect(native.start).toHaveBeenCalledTimes(1);
    expect(native.check).toHaveBeenCalledTimes(1);
    expect(updater.status()).toBe("enabled");
    native.isInstalling.mockReturnValue(true);
    expect(updater.isInstalling()).toBe(true);
  });

  it.skipIf(process.platform !== "darwin")("reports a missing bridge without breaking application startup", () => {
    native.load.mockImplementationOnce(() => { throw new Error("Bridge missing"); });
    const showError = vi.fn();
    const updater = createDesktopUpdater({ isPackaged: true, resourcesPath: "/resources", showError });
    updater.start();
    expect(updater.status()).toBe("unavailable");
    updater.check();
    expect(showError).toHaveBeenCalledWith("Updates unavailable", "Bridge missing");
  });
});
