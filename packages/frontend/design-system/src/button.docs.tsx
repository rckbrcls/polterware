import { Button, LinkButton } from "./button";
import { ListFilter, PlusIcon } from "./hugeicons";
import type { DocEntry } from "./docs/types";

export default {
  name: "Button",
  group: "Buttons",
  summary:
    "Product button. Solid variants share the opaque keycap chrome (with an optional `tone` palette); ghost and icon stay flat. The default is secondary; use primary only for a page header call to action.",
  exports: ["Button", "LinkButton"],
  examples: [
    {
      id: "variants",
      title: "Variants",
      render: () => (
        // #region variants
        <>
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="brand">Brand</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </>
        // #endregion
      ),
    },
    {
      id: "tones",
      title: "Tones",
      description: "`tone` swaps the palette of a solid variant.",
      render: () => (
        // #region tones
        <>
          <Button tone="neutral">Neutral</Button>
          <Button tone="success">Success</Button>
          <Button tone="warn">Warn</Button>
          <Button tone="info">Info</Button>
          <Button tone="critical">Critical</Button>
          <Button tone="violet">Violet</Button>
          <Button tone="teal">Teal</Button>
          <Button tone="pink">Pink</Button>
        </>
        // #endregion
      ),
    },
    {
      id: "sizes",
      title: "Sizes",
      render: () => (
        // #region sizes
        <>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
        </>
        // #endregion
      ),
    },
    {
      id: "icon",
      title: "Icon button",
      description: "An icon-only button shows its aria-label or title as a tooltip.",
      render: () => (
        // #region icon
        <Button variant="icon" aria-label="Add item">
          <PlusIcon size={14} />
        </Button>
        // #endregion
      ),
    },
    {
      id: "icon-sizes",
      title: "Icon size",
      description: "size=\"icon\" gives a square control for any variant; icon-only buttons need an aria-label.",
      render: () => (
        // #region icon-sizes
        <>
          <Button size="icon" variant="ghost" aria-label="Add ghost">
            <PlusIcon size={14} />
          </Button>
          <Button size="icon" variant="secondary" aria-label="Add secondary">
            <PlusIcon size={14} />
          </Button>
          <Button size="icon" variant="danger" aria-label="Add danger">
            <PlusIcon size={14} />
          </Button>
        </>
        // #endregion
      ),
    },
    {
      id: "texture",
      title: "Texture variant",
      description: "Framed gradient face, the standard bordered button. `textureTone` picks neutral, brand, danger, success, warn or info; `selected` marks an applied state such as an active filter.",
      render: () => (
        // #region texture
        <>
          <Button variant="texture">Neutral</Button>
          <Button variant="texture" textureTone="brand">Brand</Button>
          <Button variant="texture" textureTone="danger">Danger</Button>
          <Button variant="texture" textureTone="success">Success</Button>
          <Button variant="texture" textureTone="warn">Warn</Button>
          <Button variant="texture" textureTone="info">Info</Button>
          <Button variant="texture" size="icon" aria-label="Add">
            <PlusIcon size={14} />
          </Button>
          <Button variant="texture" size="icon" selected aria-label="Filter (applied)">
            <PlusIcon size={14} />
          </Button>
          <Button variant="texture" disabled>Disabled</Button>
        </>
        // #endregion
      ),
    },
    {
      id: "disabled",
      title: "Disabled",
      render: () => (
        // #region disabled
        <>
          <Button disabled>Secondary</Button>
          <Button variant="primary" disabled>
            Primary
          </Button>
        </>
        // #endregion
      ),
    },
    {
      id: "link",
      title: "Link button",
      description: "A native anchor with the same materials and sizing as Button.",
      render: () => (
        // #region link
        <LinkButton href="https://polterware.com" target="_blank" rel="noreferrer">
          Open site
        </LinkButton>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
