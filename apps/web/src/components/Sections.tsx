import { For, Show, children, createSignal, type JSX } from "solid-js";
import { Check, Copy, ArrowRight02Icon } from "@polterware/frontend-design-system";

export function Hero(props: {
  eyebrow?: string;
  title: JSX.Element;
  lead: JSX.Element;
  actions?: JSX.Element;
  aside?: JSX.Element;
}) {
  // Resolve JSX props once: reading them in both `when` and the body would render twice.
  const aside = children(() => props.aside);
  const actions = children(() => props.actions);
  return (
    <section class="hero site-container" aria-labelledby="hero-title">
      <Show when={props.eyebrow}><p class="eyebrow">{props.eyebrow}</p></Show>
      <h1 id="hero-title">{props.title}</h1>
      <div class="hero-foot">
        <p class="hero-lead">{props.lead}</p>
        <Show when={aside()}><div class="hero-aside">{aside()}</div></Show>
      </div>
      <Show when={actions()}><div class="hero-actions">{actions()}</div></Show>
    </section>
  );
}

/** A wide product picture that bleeds past the text column, like Linear's app shot. */
export function Showcase(props: { children: JSX.Element }) {
  return <div class="showcase site-container"><div class="showcase-frame">{props.children}</div></div>;
}

/** Linear-style statement: the first sentence bright, the rest muted. */
export function Statement(props: { eyebrow?: string; strong: string; rest: string }) {
  return (
    <section class="statement site-container">
      <Show when={props.eyebrow}><p class="eyebrow mono">{props.eyebrow}</p></Show>
      <h2><span>{props.strong}</span> {props.rest}</h2>
    </section>
  );
}

export function FigureRow(props: { items: Array<{ figure: JSX.Element; title: string; body: string }> }) {
  return (
    <section class="figure-row site-container">
      <For each={props.items}>{(item, index) => (
        <article class="figure-cell">
          <span class="mono fig-label">FIG 0.{index() + 1}</span>
          <div class="figure-art">{item.figure}</div>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
        </article>
      )}</For>
    </section>
  );
}

export function Feature(props: {
  id?: string;
  index?: string;
  eyebrow?: string;
  title: string;
  body: string;
  points?: string[];
  visual: JSX.Element;
  reverse?: boolean;
}) {
  return (
    <section id={props.id} class="feature site-container" classList={{ "feature-reverse": props.reverse }}>
      <div class="feature-copy">
        <Show when={props.eyebrow}><p class="eyebrow mono">{props.index ? `${props.index} ` : ""}{props.eyebrow}</p></Show>
        <h2>{props.title}</h2>
        <p>{props.body}</p>
        <Show when={props.points}>
          <ul class="feature-points">
            <For each={props.points}>{(point) => <li><Check size={16} />{point}</li>}</For>
          </ul>
        </Show>
      </div>
      <div class="feature-visual">{props.visual}</div>
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
    <div class="install">
      <code><span class="mk-prompt" aria-hidden="true">$</span>{props.command}</code>
      <button type="button" class="install-copy" onClick={copy} aria-label={props.label ?? "Copy install command"}>
        <Show when={copied()} fallback={<Copy size={16} />}><Check size={16} /></Show>
      </button>
    </div>
  );
}

export function ClosingCta(props: { title: string; body: string; actions: JSX.Element }) {
  return (
    <section class="closing site-container">
      <h2>{props.title}</h2>
      <p>{props.body}</p>
      <div class="hero-actions">{props.actions}</div>
    </section>
  );
}

export function NextLink(props: { href: string; label: string; detail: string }) {
  return (
    <a class="next-link card-texture" href={props.href}>
      <span class="mono">{props.detail}</span>
      <strong>{props.label}<ArrowRight02Icon size={18} /></strong>
    </a>
  );
}

