class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
const safeGetComputedStyle: typeof window.getComputedStyle = (element, pseudoElement) => {
  const style = nativeGetComputedStyle(element, pseudoElement);
  try {
    void style.color;
    return style;
  } catch {
    return {
      color: element instanceof HTMLElement ? element.style.color : "",
      borderTopLeftRadius: element instanceof HTMLElement ? element.style.borderTopLeftRadius : "",
    } as CSSStyleDeclaration;
  }
};

window.getComputedStyle = safeGetComputedStyle;
globalThis.getComputedStyle = safeGetComputedStyle;

if (!("inert" in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, "inert", {
    configurable: true,
    get() {
      return this.hasAttribute("inert");
    },
    set(value: boolean) {
      this.toggleAttribute("inert", value);
    },
  });
}
