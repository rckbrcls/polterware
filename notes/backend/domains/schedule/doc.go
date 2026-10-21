// Package schedule implements recurrence, calendar queries and reminder plans
// as pure functions. All returned instants are UTC; civil arithmetic takes an
// explicit location. Range queries are half-open, Next is strictly after, and
// until is inclusive. Wall-clock gaps shift forward and folds choose the earlier
// instant. Hourly/minutely series use elapsed time. All-day series use local
// midnight as their completion key and the configured delivery time separately.
// Sub-day all-day recurrence is rejected because it cannot represent dates.
//
// Intentional differences from the Swift reference:
//   - Weekday masks honor interval, until and count (Swift ignores these).
//   - Months/years derive from the anchor, avoiding iterative month-end drift.
//   - Sunday is bit 0, rather than Swift's bit 1.
//   - Completions use exact instants, rather than whole calendar days.
//   - Nonexistent wall times shift by the gap, ambiguous times use the first
//     instant, and Next is strictly after even for one-shot rules.
//   - The planner enforces a nearest-first global budget, rather than Swift's
//     per-note pending limits; note bodies are plain text capped at 140 runes.
//
// Swift goldens cover daily, weekly without masks, monthly day <=28, non-leap
// yearly, hourly and minutely, where the reference matches normative semantics.
// The fixture generator in testdata/swift copies the reference's Calendar
// stepping for those simple cases; it is not production code.
//
// Safety/performance: Between/Count cap expansion at 10000; infinite range
// queries cap at five years. Calendar queries default to examining at most 256
// occurrences per note, configurable via OccurrenceQuery.PerNoteLimit or
// Engine.PerNoteLimit (1..10000), before filtering completions. The global
// limit caps returned occurrences separately. Dense series return a prefix;
// callers narrow the range for later dates. The frozen RPC limit maps to the
// global limit; W1-CORE can configure the separate per-note domain parameter.
// Plan seeks directly to now, lazily merges series with one candidate each, and
// stops at Budget (default/hard ceiling 60). Open-ended interval-1 minutely,
// hourly, daily and weekly rules emit native Repeat matchers (one slot per
// weekday) that never run out; bounded rules, every>1, monthly and yearly stay
// concrete one-shots. Repeating identifiers are rem:<id>:repeat or rem:<id>:wd<n>
// (Sunday=1). Completions cannot suppress a repeating trigger. DiffPlan ignores
// next-fire drift on repeating items so OS calendar triggers are not restarted;
// debounce and change-stream routing belong to W1-CORE and W1-NATIVE-NOTIFY.
// Native hourly/minutely matching is wall-clock (OS); occurrence listing stays
// elapsed-time. Wire mapping of Repeat is tracked in request w1-recurrence-1;
// this package does not change frozen contracts. No package cache or implicit
// clock is used.
package schedule
