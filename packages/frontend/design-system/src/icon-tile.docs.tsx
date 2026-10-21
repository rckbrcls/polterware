import { AuroraCover, IconTile } from "./icon-tile";
import { Database, Folder, Shield } from "./hugeicons";
import type { DocEntry } from "./docs/types";

export default {
  name: "Icon Tile",
  group: "Layout",
  summary: "IconTile places a dark mark over a light, seeded chrome finish, while AuroraCover supplies the matching decorative cover strip. Choose a semantic tone, recognized brand, or aurora palette instead of custom dark accents.",
  exports: ["AuroraCover", "IconTile"],
  examples: [
    { id: "tones", title: "Semantic tones", render: () => (
      // #region tones
      <><IconTile tone="architecture"><Folder size={14} /></IconTile><IconTile tone="data" size={28}><Database size={16} /></IconTile><IconTile tone="security" size={36}><Shield size={18} /></IconTile></>
      // #endregion
    ) },
    { id: "brand", title: "Brand and dimmed", render: () => (
      // #region brand
      <><IconTile brand="github" seed="github"><Folder size={14} /></IconTile><IconTile dimmed><Folder size={14} /></IconTile></>
      // #endregion
    ) },
    { id: "aurora-cover", title: "Aurora cover", wide: true, render: () => (
      // #region aurora-cover
      <AuroraCover palette="ocean" seed="project-ocean" class="h-20 w-full" />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
