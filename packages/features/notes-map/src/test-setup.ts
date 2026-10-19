class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({ matches: query.includes("reduced-motion"), media: query, addEventListener() {}, removeEventListener() {} }),
});
if (!("inert" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "inert", {
    configurable: true,
    get() { return this.hasAttribute("inert"); },
    set(value: boolean) { this.toggleAttribute("inert", value); },
  });
}
HTMLElement.prototype.scrollIntoView = () => {};
HTMLElement.prototype.setPointerCapture = () => {};
HTMLElement.prototype.releasePointerCapture = () => {};
HTMLElement.prototype.hasPointerCapture = () => false;
