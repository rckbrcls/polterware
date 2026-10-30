import { DetailPanel } from "./detail-panel";
import { InformationCircle, Terminal } from "./hugeicons";
import { RailGroup, RailPage } from "./rail-page";
import type { DocEntry } from "./docs/types";

function RunPage() {
  return (
    // #region run
    <div class="flex h-[360px] min-h-0 flex-col">
      <RailPage
        onBack={() => undefined}
        railStorageKey="docs.rail-page"
        wide
        rail={
          <RailGroup title="Run" icon={<InformationCircle size={14} />} tone="knowledge">
            <DetailPanel.Properties variant="rail">
              <DetailPanel.Property label="Model" value="grok-4.7" />
              <DetailPanel.Property label="Route" value="hard · high" />
            </DetailPanel.Properties>
          </RailGroup>
        }
      >
        <div class="pt-6">
          <RailGroup title="Log" icon={<Terminal size={14} />} tone="observability" aside="1 line">
            <p class="m-0 px-1 font-mono text-[12px]">output: go vet reported an unused import</p>
          </RailGroup>
        </div>
      </RailPage>
    </div>
    // #endregion
  );
}

export default {
  name: "RailPage",
  group: "Pages",
  summary:
    "The two-column page structure of docs and runs, as in a Linear issue: a 44px header with Back and the actions; the content in the center; and a 376px rail on the right that opens as a floating drawer on narrow pages. RailGroup titles each group with an optional icon tile; groups are separated by space, never cards.",
  exports: ["RailPage", "RailGroup"],
  examples: [{ id: "run", title: "A run: its log and its metadata", wide: true, render: () => <RunPage /> }],
} satisfies DocEntry;
