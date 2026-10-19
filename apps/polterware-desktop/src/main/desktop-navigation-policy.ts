export type RendererUrlPolicyOptions = {
  isPackaged: boolean;
  /** Dev Vite URL from ELECTRON_RENDERER_URL when unpackaged. */
  rendererDevUrl?: string | null;
  /** file: pathname of the packaged renderer index.html. */
  packagedRendererPathname: string;
};

/** Only http(s) may leave the Desktop via openExternal. */
export function canOpenExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** True when navigation stays on the Desktop renderer document. */
export function isAllowedRendererUrl(
  rawUrl: string,
  options: RendererUrlPolicyOptions,
): boolean {
  try {
    const currentUrl = new URL(rawUrl);

    if (!options.isPackaged && options.rendererDevUrl) {
      const expectedUrl = new URL(options.rendererDevUrl);
      return (
        currentUrl.origin === expectedUrl.origin &&
        currentUrl.pathname === expectedUrl.pathname
      );
    }

    return (
      currentUrl.protocol === "file:" &&
      currentUrl.pathname === options.packagedRendererPathname
    );
  } catch {
    return false;
  }
}
