import { AuroraCover, IconTile } from "./icon-tile";
import type { ChromePreset } from "./chrome-finish";
import { Database, Folder, Shield } from "./hugeicons";
import type { DocEntry } from "./docs/types";

export default {
  name: "Icon Tile",
  group: "Layout",
  summary: "IconTile is a neutral lit tile whose mark is cut out of a seeded chrome finish tinted by the accent; AuroraCover supplies the matching full-chrome cover strip. Seeds vary the angle, phase, and split of the chromatic metal. Pin chromePreset to change the reflection shape. Choose a semantic tone, recognized brand, or aurora palette; dark custom accents are lifted so the mark stays legible. finish=\"chrome\" paints the metal over the whole tile, and finish=\"plain\" keeps the tile and mark neutral.",
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
    { id: "plain", title: "Plain finish", render: () => (
      // #region plain
      <><IconTile finish="plain"><Folder size={14} /></IconTile><IconTile finish="plain" size={28}><Database size={16} /></IconTile><IconTile finish="plain" size={36}><Shield size={18} /></IconTile><IconTile finish="plain" size={36} dimmed><Folder size={18} /></IconTile></>
      // #endregion
    ) },
    { id: "chrome-mark", title: "Chrome mark", render: () => (
      // #region chrome-mark
      <><IconTile tone="architecture" seed="mark-folder"><Folder size={14} /></IconTile><IconTile brand="postgres" size={28} seed="mark-db"><Database size={16} /></IconTile><IconTile aurora="ember" size={36} seed="mark-shield"><Shield size={18} /></IconTile><IconTile aurora="orchid" size={36} seed="mark-orchid"><Folder size={18} /></IconTile><IconTile size={36} dimmed><Folder size={18} /></IconTile></>
      // #endregion
    ) },
    { id: "reflections", title: "Chrome reflection families", wide: true, render: () => (
      // #region reflections
      <div class="grid w-full grid-cols-2 gap-6 sm:grid-cols-3">
        {(["horizon", "satin", "radial", "liquid", "folded"] satisfies ChromePreset[]).map((preset) => (
          <div class="flex flex-col items-start gap-3">
            <AuroraCover palette="ocean" seed="reflection-study" chromePreset={preset} class="w-full" />
            <div class="flex items-center gap-3">
              <IconTile finish="chrome" aurora="ocean" size={36} seed="reflection-study" chromePreset={preset}><Folder size={18} /></IconTile>
              <span>{preset}</span>
            </div>
          </div>
        ))}
      </div>
      // #endregion
    ) },
    { id: "seeded-reflections", title: "Seeded procedural variety", render: () => (
      // #region seeded-reflections
      <>
        {Array.from({ length: 10 }, (_, index) => (
          <IconTile finish="chrome" aurora="ocean" size={36} seed={`chrome-${index}`}><Folder size={18} /></IconTile>
        ))}
      </>
      // #endregion
    ) },
    { id: "aurora-cover", title: "Aurora cover", wide: true, render: () => (
      // #region aurora-cover
      <AuroraCover palette="ocean" seed="project-ocean" class="h-20 w-full" />
      // #endregion
    ) },
  ],
} satisfies DocEntry;
