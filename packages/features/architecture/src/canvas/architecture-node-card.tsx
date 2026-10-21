import { Show } from "solid-js";
import type { NodeState, NodeType } from "@polterware/frontend-canvas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  MoreHorizontal,
  StatusDot,
} from "@polterware/frontend-design-system";
import { statusTone } from "../domain/registry";
import { nodeStatusLabel } from "../domain/node-lifecycle";
import { ArchitectureNodeIcon, resolveNodeIconName } from "./architecture-node-icon";

export { nodeStatusLabel } from "../domain/node-lifecycle";

export {
  HANDLE_SIDES,
  resolveHandleState,
  shouldShowConnectionHandles,
  type HandleSide,
  type HandleState,
} from "./connection-handles";

export type ArchitectureNodeCardProps = {
  /** Node id; seeds the icon tile's finish. */
  id?: string;
  name: string;
  type: NodeType;
  subtype?: string;
  provider?: string;
  state: NodeState;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
  dimmed: boolean;
  lodFar: boolean;
  editing: boolean;
  onRenameEnd: (newName: string) => void;
  onRenameCancel: () => void;
  onActionOpenDetails: () => void;
  onActionRename: () => void;
  onActionConnect: () => void;
  onActionHighlight: () => void;
  onActionDuplicate: () => void;
  onActionCopy: () => void;
  onActionDelete: () => void;
  dragOffset?: { dx: number; dy: number } | null;
  entering?: boolean;
  onEnterEnd?: () => void;
  /** Fill the placement frame instead of positioning in world space. */
  fill?: boolean;
  /** Parent card: the header stays put and the rest is the child well. */
  nestParent?: boolean;
};

export function ArchitectureNodeCard(props: ArchitectureNodeCardProps) {
  const iconName = () => resolveNodeIconName(props);

  return (
    <div
      class="architecture-node-positioner"
      data-detail-opener
      style={
        props.fill
          ? { position: "absolute", inset: "0", width: "100%", height: "100%" }
          : {
              position: "absolute",
              left: `${props.x}px`,
              top: `${props.y}px`,
              width: `${props.width}px`,
              "min-height": `${props.height}px`,
              height: `${props.height}px`,
              transform: props.dragOffset
                ? `translate3d(${props.dragOffset.dx}px, ${props.dragOffset.dy}px, 0)`
                : undefined,
            }
      }
    >
      <div
        class="architecture-node-card"
        data-dimmed={props.dimmed ? "" : undefined}
        data-selected={props.selected ? "" : undefined}
        data-entering={props.entering && !props.fill ? "" : undefined}
        data-nest-parent={props.nestParent ? "" : undefined}
        onAnimationEnd={(event) => {
          if (
            event.target === event.currentTarget
            && event.animationName === "architecture-node-enter"
          ) {
            props.onEnterEnd?.();
          }
        }}
      >
        <div class="architecture-node-card-body">
          <ArchitectureNodeIcon
            name={iconName()}
            subtype={props.subtype}
            provider={props.provider}
            compact={props.lodFar}
            seed={props.id}
            dimmed={props.dimmed}
          />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <Show
              when={props.editing}
              fallback={
                <span
                  class="min-w-0 truncate font-medium leading-tight"
                  classList={{ "text-xs": props.lodFar, "text-[13px]": !props.lodFar }}
                >
                  {props.name}
                </span>
              }
            >
              <Input
                size="sm"
                class="w-full px-1"
                value={props.name}
                autofocus
                onBlur={(event) => props.onRenameEnd(event.currentTarget.value || props.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") if (event.target instanceof HTMLInputElement) event.target.blur();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    props.onRenameCancel();
                  }
                  event.stopPropagation();
                }}
              />
            </Show>
            <Show when={!props.lodFar}>
              <StatusDot
                tone={statusTone(props.state)}
                label={nodeStatusLabel(props.state)}
                class="min-w-0 truncate !text-[10px]"
              />
            </Show>
          </div>
          <Show when={!props.lodFar}>
            <div
              class="shrink-0"
              onPointerDown={(event) => event.stopPropagation()}
              onDblClick={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={`Actions for ${props.name}`}
                  class="h-6 w-6 justify-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                >
                  <MoreHorizontal size={14} />
                </DropdownMenuTrigger>
                <DropdownMenuContent class="min-w-44">
                  <DropdownMenuItem value="open-details" onSelect={props.onActionOpenDetails}>
                    Open details
                  </DropdownMenuItem>
                  <DropdownMenuItem value="rename" onSelect={props.onActionRename}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem value="connect" onSelect={props.onActionConnect}>
                    Connect
                  </DropdownMenuItem>
                  <DropdownMenuItem value="highlight" onSelect={props.onActionHighlight}>
                    Highlight dependencies
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem value="duplicate" onSelect={props.onActionDuplicate}>
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem value="copy" onSelect={props.onActionCopy}>
                    Copy
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem value="delete" danger onSelect={props.onActionDelete}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
