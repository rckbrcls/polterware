import { For } from "solid-js";
import { Bell, CalendarClock, Search, StickyNote } from "@polterware/frontend-design-system";

/** Illustrative data: a code-built picture of Polterware Notes, not a live library. */
const spaces = [
  { label: "Inbox", icon: StickyNote, count: 4 },
  { label: "Today", icon: CalendarClock, count: 3 },
  { label: "Reminders", icon: Bell, count: 2 },
  { label: "Search", icon: Search },
];

const notes = [
  { title: "Release checklist", meta: "Work · edited 12 min ago", active: true },
  { title: "Ideas for the importer", meta: "Work · edited yesterday" },
  { title: "Dentist, Thursday 09:30", meta: "Personal · reminder" },
  { title: "Reading list", meta: "Personal · 7 notes" },
];

export function NotesMockup(props: { compact?: boolean }) {
  return (
    <div class="mk-window" classList={{ "mk-compact": props.compact }} role="img" aria-label="Polterware Notes desktop app showing a note list and an open note">
      <div class="mk-titlebar"><span class="mk-dots"><i /><i /><i /></span><span class="mk-title">Polterware Notes · Work</span></div>
      <div class="mk-body">
        <aside class="mk-sidebar">
          <For each={spaces}>{(item, i) => (
            <span class="mk-nav" classList={{ "mk-nav-active": i() === 0 }}>
              <item.icon size={14} />{item.label}{item.count ? <span class="mk-count">{item.count}</span> : null}
            </span>
          )}</For>
        </aside>
        <section class="mk-main">
          <header class="mk-main-head"><strong>Release checklist</strong><span>Work · reminder Fri 10:00</span></header>
          <div class="mk-rows">
            <For each={notes}>{(note) => (
              <div class="mk-row">
                <div class="mk-row-copy"><strong>{note.title}</strong><span>{note.meta}</span></div>
              </div>
            )}</For>
          </div>
          <div class="mk-evidence"><span class="mono">TAGS</span><span>release</span><span>checklist</span></div>
        </section>
      </div>
    </div>
  );
}
