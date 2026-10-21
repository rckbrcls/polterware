import { createSignal } from "solid-js";
import { ToggleChip } from "./toggle-chip";
import type { DocEntry } from "./docs/types";

export default {
  name: "ToggleChip",
  group: "Buttons",
  summary:
    "Multi-select pill that is quiet when off and filled with a status tone when on. Use it for independent toggles such as environment kinds; FilterChip stays the exclusive filter.",
  exports: ["ToggleChip"],
  examples: [
    {
      id: "tones",
      title: "Tones",
      render: () => {
        // #region tones
        const [on, setOn] = createSignal({ dev: true, staging: true, prod: false });
        const flip = (key: "dev" | "staging" | "prod") => setOn((value) => ({ ...value, [key]: !value[key] }));
        return (
          <>
            <ToggleChip tone="muted" selected={on().dev} onClick={() => flip("dev")}>
              Development
            </ToggleChip>
            <ToggleChip tone="syncing" selected={on().staging} onClick={() => flip("staging")}>
              Staging
            </ToggleChip>
            <ToggleChip tone="warn" selected={on().prod} onClick={() => flip("prod")}>
              Production
            </ToggleChip>
          </>
        );
        // #endregion
      },
    },
  ],
} satisfies DocEntry;
