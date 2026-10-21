import { createSignal, onCleanup } from "solid-js";
import { Button } from "@polterware/frontend-design-system";

export function CodeBlock(props: { code: string }) {
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return <div class="docs-code">
    <Button variant="ghost" size="sm" class="docs-code__copy" onClick={copy}>{copied() ? "Copied" : "Copy"}</Button>
    <pre><code>{props.code}</code></pre>
  </div>;
}
