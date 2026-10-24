import { createContext, Show, useContext, type Accessor, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

/** The global detail host lends its collection canvas to full documents. */
export const EntityDocumentContext = createContext<Accessor<HTMLElement | undefined>>();

export function EntityDocumentCanvas(props: { children: JSX.Element }) {
  const host = useContext(EntityDocumentContext);
  return <Show when={host?.()} keyed>{mount => <Portal mount={mount}>{props.children}</Portal>}</Show>;
}
