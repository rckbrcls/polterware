import { For } from "solid-js";
import "../boot-splash.css";

/** Manhattan distance from the center (`r`) and checker parity (`p`) for each dot of the 5x5 grid. */
const DOTS = Array.from({ length: 25 }, (_, index) => {
  const x = index % 5;
  const y = Math.floor(index / 5);
  return { r: Math.abs(x - 2) + Math.abs(y - 2), p: (x + y) % 2 };
});

/** The boot splash echo pulse, as an in-app progress mark. Styles live in boot-splash.css. */
export function EchoRing(props: { class?: string; label?: string }) {
  return (
    <span class={`echo-ring ${props.class ?? ""}`} role="img" aria-label={props.label ?? "Loading"}>
      <For each={DOTS}>{(dot) => <i style={{ "--r": dot.r, "--p": dot.p }} />}</For>
    </span>
  );
}
