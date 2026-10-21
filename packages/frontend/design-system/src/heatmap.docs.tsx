import { Heatmap } from "./heatmap";
import type { DocEntry } from "./docs/types";

const days = Array.from({ length: 56 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 9, 4 + index)).toISOString().slice(0, 10),
  value: index % 6 === 0 ? 0 : (index * 7) % 20,
}));

export default {
  name: "Heatmap",
  group: "Data",
  summary:
    "Read-only contribution calendar. The caller supplies dates and complete weeks, with optional intensity thresholds and accessible day labels.",
  exports: ["Heatmap"],
  examples: [
    {
      id: "default",
      title: "Contribution calendar",
      render: () => (
        // #region default
        <Heatmap days={days} label="Project activity over eight weeks" />
        // #endregion
      ),
    },
    {
      id: "thresholds",
      title: "Custom thresholds and labels",
      render: () => (
        // #region thresholds
        <Heatmap
          days={days}
          label="Reviewed changes"
          thresholds={[2, 5, 10, 15]}
          formatLabel={(day) => `${day.date}: ${day.value} changes reviewed`}
        />
        // #endregion
      ),
    },
    {
      id: "inactive",
      title: "No activity",
      render: () => (
        // #region inactive
        <Heatmap days={days.map((day) => ({ ...day, value: 0 }))} label="No activity recorded" />
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
