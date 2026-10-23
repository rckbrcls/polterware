import { For, Show, children, createSignal, type JSX } from "solid-js";
import { Button, Check, Copy } from "@polterware/frontend-design-system";
import { heroExit, reveal, settle } from "./scroll-motion";

export function Hero(props: { title: JSX.Element; lead: JSX.Element; actions?: JSX.Element }) {
  // Resolve JSX props once: reading them in both `when` and the body would render twice.
  const actions = children(() => props.actions);
  return (
    <section class="hero site-container" aria-labelledby="hero-title" ref={heroExit()}>
      <h1 id="hero-title">{props.title}</h1>
      <p class="hero-lead">{props.lead}</p>
      <Show when={actions()}><div class="hero-actions">{actions()}</div></Show>
    </section>
  );
}

/** A wide product picture that bleeds past the text column, like Linear's app shot. */
export function Showcase(props: { children: JSX.Element }) {
  return <div class="showcase site-container"><div class="showcase-frame" ref={settle()}>{props.children}</div></div>;
}

export function Feature(props: { title: string; body: string; points?: string[]; visual: JSX.Element }) {
  return (
    <section class="feature site-container">
      <div class="feature-copy" ref={reveal({ stagger: true })}>
        <h2>{props.title}</h2>
        <p>{props.body}</p>
        <Show when={props.points}>
          <ul class="feature-points">
            <For each={props.points}>{(point) => <li><Check size={16} />{point}</li>}</For>
          </ul>
        </Show>
      </div>
      <div class="feature-visual" ref={reveal({ x: 48 })}>{props.visual}</div>
    </section>
  );
}

export function InstallCommand(props: { command: string; label?: string }) {
  const [copied, setCopied] = createSignal(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div class="install card-texture">
      <code><span class="mk-prompt" aria-hidden="true">$</span>{props.command}</code>
      <Button variant="texture" size="icon" onClick={copy} aria-label={props.label ?? "Copy install command"}>
        <Show when={copied()} fallback={<Copy size={16} />}><Check size={16} /></Show>
      </Button>
    </div>
  );
}
