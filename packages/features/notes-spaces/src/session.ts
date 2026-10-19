import { createSignal } from "solid-js";

const [revision, setRevision] = createSignal(0);

export const spacesRevision = revision;

export function bumpSpaces(): void {
  setRevision((value) => value + 1);
}
