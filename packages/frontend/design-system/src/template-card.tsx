import { For, type JSX } from "solid-js";
import { IconTile, type IconTileTone } from "./icon-tile";
import "./template-card.css";

export type TemplateCardProps = {
  title: string;
  description: string;
  icon: JSX.Element;
  tone?: IconTileTone;
  brand?: string | readonly string[];
  index?: number;
  class?: string;
  /** Seeds the icon tile's finish; defaults to the title. */
  seed?: string;
  onSelect: () => void;
};

export function TemplateCard(props: TemplateCardProps) {
  const delayMs = () => Math.min((props.index ?? 0) * 40, 240);

  return (
    <button
      type="button"
      class={`pw-template-card card-texture ${props.class ?? ""}`}
      style={{ "animation-delay": `${delayMs()}ms` }}
      onClick={() => props.onSelect()}
    >
      <IconTile size={28} tone={props.tone ?? "neutral"} brand={props.brand} seed={props.seed ?? props.title}>
        {props.icon}
      </IconTile>
      <div class="grid gap-1">
        <p class="pw-template-card__title">{props.title}</p>
        <p class="pw-template-card__description">{props.description}</p>
      </div>
    </button>
  );
}

export type TemplateCardGridItem = {
  id: string;
  title: string;
  description: string;
  icon: JSX.Element;
  tone?: IconTileTone;
  brand?: string | readonly string[];
  onSelect: () => void;
};

export type TemplateCardGridProps = {
  label?: string;
  items: TemplateCardGridItem[];
  class?: string;
};

export function TemplateCardGrid(props: TemplateCardGridProps) {
  return (
    <div class={`pw-template-card-grid ${props.class ?? ""}`}>
      {props.label ? <p class="pw-template-card-grid__label">{props.label}</p> : null}
      <For each={props.items}>
        {(item, index) => (
          <TemplateCard
            title={item.title}
            description={item.description}
            icon={item.icon}
            tone={item.tone}
            brand={item.brand}
            index={index()}
            seed={item.id}
            onSelect={item.onSelect}
          />
        )}
      </For>
    </div>
  );
}
