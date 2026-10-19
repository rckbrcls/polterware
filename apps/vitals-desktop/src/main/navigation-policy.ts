export function isAllowedRendererUrl(raw: string, documentUrl: string): boolean {
  try {
    const url = new URL(raw);
    const expected = new URL(documentUrl);
    return (
      url.protocol === expected.protocol &&
      url.host === expected.host &&
      url.pathname === expected.pathname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function canOpenExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
