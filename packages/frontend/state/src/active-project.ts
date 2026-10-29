import { createSignal } from "solid-js";

/**
 * The project the Desktop has open, for features that keep per-project preferences in the
 * store (saved filters) without threading the id through every page. The host sets it.
 */
const [activeProjectId, setActiveProjectId] = createSignal("");

export { activeProjectId, setActiveProjectId };
