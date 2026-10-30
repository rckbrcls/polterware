import { For, createSignal } from "solid-js";
import { Button } from "./button";
import { Morph, useMorph } from "./morph";
import { pushToast } from "./toast";
import type { DocEntry } from "./docs/types";

function LaterConfirm() {
  const morph = useMorph();
  return (
    <Button size="sm" variant="primary" data-autofocus onClick={() => { morph.close(); pushToast("Moved to Later"); }}>
      Move to Later
    </Button>
  );
}

function AnswerPicker() {
  const morph = useMorph();
  const [answer, setAnswer] = createSignal("");
  return (
    <>
      <Morph.Body>
        <div role="radiogroup" aria-label="Answer" class="grid gap-1">
          <For each={["Yes", "No"]}>
            {(option) => (
              <Button size="sm" variant="ghost" role="radio" aria-checked={answer() === option} selected={answer() === option} onClick={() => setAnswer(option)}>
                {option}
              </Button>
            )}
          </For>
        </div>
      </Morph.Body>
      <Morph.Footer>
        <Button size="sm" variant="primary" disabled={!answer()} onClick={() => { morph.close(); pushToast(`Decided: ${answer()}`); }}>
          Record decision
        </Button>
      </Morph.Footer>
    </>
  );
}

export default {
  name: "Morph",
  group: "Overlays",
  summary: "A button that turns into a small panel in place, for a confirm or a short input that belongs to that one button. The button itself grows upward into a tall surface: a card with the title, the content, and the confirm (full width, in Morph.Footer) on top, and Cancel under it on the button's exact place, outside the card, so dismissing needs no travel. It closes on Escape, a click outside, or Cancel. The trigger's hint is a tooltip that says what the action does. App-level destructive confirms stay on requestConfirm.",
  exports: ["Morph", "useMorph"],
  examples: [
    {
      id: "confirm",
      title: "Confirm an action",
      render: () => (
        // #region confirm
        <Morph.Root>
          <Morph.Trigger size="sm" variant="ghost" hint="Set this aside. It stays in the Inbox, dimmed under Later.">
            Later
          </Morph.Trigger>
          <Morph.Panel title="Move to Later?">
            <Morph.Body>The item stays in the Inbox, dimmed under Later, until you come back to it.</Morph.Body>
            <Morph.Footer>
              <LaterConfirm />
            </Morph.Footer>
          </Morph.Panel>
        </Morph.Root>
        // #endregion
      ),
    },
    {
      id: "answer",
      title: "Pick an answer",
      render: () => (
        // #region answer
        <Morph.Root>
          <Morph.Trigger size="sm" variant="primary" hint="Answer this question.">Decide</Morph.Trigger>
          <Morph.Panel title="Ship the event stream behind a flag?">
            <AnswerPicker />
          </Morph.Panel>
        </Morph.Root>
        // #endregion
      ),
    },
  ],
} satisfies DocEntry;
