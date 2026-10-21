import { createSignal } from "solid-js";
import { Button } from "./button";
import { CalendarGrid } from "./calendar-grid";
import type { DocEntry } from "./docs/types";

function Schedule() {
  const [completed, setCompleted] = createSignal(false);
  const [more, setMore] = createSignal(false);
  return (
    // #region schedule
    <CalendarGrid.Root view="schedule" label="Review schedule">
      <CalendarGrid.Agenda>
        <CalendarGrid.Header>Wednesday, October 21</CalendarGrid.Header>
        <CalendarGrid.Occurrence completed={completed()} onClick={() => setCompleted((value) => !value)}>
          Review imported evidence
        </CalendarGrid.Occurrence>
        <CalendarGrid.Occurrence overdue>Resolve overdue drift finding</CalendarGrid.Occurrence>
        <CalendarGrid.Occurrence disabled>Archived review</CalendarGrid.Occurrence>
        <CalendarGrid.Overflow count={2} onClick={() => setMore((value) => !value)} label="Toggle two more reviews" />
        {more() && <>
          <CalendarGrid.Occurrence>Check source paths</CalendarGrid.Occurrence>
          <CalendarGrid.Occurrence>Review active decisions</CalendarGrid.Occurrence>
        </>}
      </CalendarGrid.Agenda>
    </CalendarGrid.Root>
    // #endregion
  );
}

export default {
  name: "CalendarGrid",
  group: "Data",
  summary:
    "Compound calendar layout for schedule, day, week, month, and year views. Compose headers, days, all-day bands, time rows, and occurrence buttons from caller-supplied calendar data.",
  exports: ["CalendarGrid"],
  examples: [
    {
      id: "day",
      title: "Day with all-day and hourly entries",
      wide: true,
      render: () => (
        // #region day
        <CalendarGrid.Root view="day" label="Wednesday schedule" hourHeight={64} gutterWidth={56}>
          <CalendarGrid.Days>
            <CalendarGrid.Day label="Wednesday, October 21" today>
              <CalendarGrid.Header>Wednesday 21</CalendarGrid.Header>
              <CalendarGrid.AllDay><CalendarGrid.Occurrence>Evidence review day</CalendarGrid.Occurrence></CalendarGrid.AllDay>
              <CalendarGrid.HourRow label="09:00"><CalendarGrid.Occurrence>Review sources</CalendarGrid.Occurrence></CalendarGrid.HourRow>
              <CalendarGrid.HourRow label="10:00" />
            </CalendarGrid.Day>
          </CalendarGrid.Days>
        </CalendarGrid.Root>
        // #endregion
      ),
    },
    { id: "schedule", title: "Schedule with completion, overdue, and overflow states", wide: true, render: () => <Schedule /> },
    {
      id: "month",
      title: "Month grid",
      wide: true,
      render: () => (
        // #region month
        <CalendarGrid.Root view="month" label="October review calendar">
          <CalendarGrid.Days>
            {[19, 20, 21, 22, 23, 24, 25].map((day) => (
              <CalendarGrid.Day label={`October ${day}`} today={day === 21}>
                <CalendarGrid.Header>{day}</CalendarGrid.Header>
                {day === 21 && <CalendarGrid.Occurrence>Review</CalendarGrid.Occurrence>}
              </CalendarGrid.Day>
            ))}
          </CalendarGrid.Days>
        </CalendarGrid.Root>
        // #endregion
      ),
    },
    {
      id: "time",
      title: "Time columns with a shared gutter",
      wide: true,
      render: () => (
        // #region time
        <CalendarGrid.Root view="week" label="Two-day time grid">
          <CalendarGrid.Time columns={2}>
            <CalendarGrid.TimeSticky zone="UTC">
              <CalendarGrid.Header>Wednesday 21</CalendarGrid.Header>
              <CalendarGrid.Header>Thursday 22</CalendarGrid.Header>
            </CalendarGrid.TimeSticky>
            <CalendarGrid.TimeBody gutter={<CalendarGrid.GutterLabel hour={0}>09:00</CalendarGrid.GutterLabel>}>
              <CalendarGrid.AllDay><CalendarGrid.Occurrence>Source review</CalendarGrid.Occurrence></CalendarGrid.AllDay>
              <CalendarGrid.AllDay><CalendarGrid.Occurrence>Decision review</CalendarGrid.Occurrence></CalendarGrid.AllDay>
            </CalendarGrid.TimeBody>
          </CalendarGrid.Time>
        </CalendarGrid.Root>
        // #endregion
      ),
    },
    {
      id: "year",
      title: "Year and mini-month containers",
      wide: true,
      render: () => (
        // #region year
        <CalendarGrid.Root view="year" label="Review year">
          <CalendarGrid.Year>
            {["October", "November", "December"].map((month) => (
              <CalendarGrid.MiniMonth>
                <CalendarGrid.Header>{month}</CalendarGrid.Header>
                <Button size="sm" variant="ghost" disabled>No reviews scheduled</Button>
              </CalendarGrid.MiniMonth>
            ))}
          </CalendarGrid.Year>
        </CalendarGrid.Root>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
