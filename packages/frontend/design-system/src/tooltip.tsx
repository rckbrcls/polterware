import {
  Tooltip as ArkTooltip,
  type TooltipTriggerProps as ArkTooltipTriggerProps,
} from "@ark-ui/solid/tooltip";
import {
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { createPopupMotion } from "./popup-motion";
import "./button.css";
import "./tooltip.css";

const DEFAULT_TOOLTIP_OPEN_DELAY = 400;
const DEFAULT_TOOLTIP_CLOSE_DELAY = 100;

export type TooltipPlacement =
  | "top-start"
  | "top"
  | "top-end"
  | "right-start"
  | "right"
  | "right-end"
  | "bottom-start"
  | "bottom"
  | "bottom-end"
  | "left-start"
  | "left"
  | "left-end";

export type TooltipRootProps = {
  children: JSX.Element;
  placement?: TooltipPlacement;
  gutter?: number;
  openDelay?: number;
  closeDelay?: number;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Positions against this rect instead of the trigger (a tooltip shared by many targets). */
  getAnchorRect?: () => { x: number; y: number; width: number; height: number } | null;
  /** Trigger DOM id, when the trigger also belongs to another Ark part (e.g. a tab). */
  triggerId?: string;
};

export type TooltipGroupProps = {
  children: JSX.Element;
};

export type TooltipTriggerProps = ArkTooltipTriggerProps;

export type TooltipContentProps = {
  children: JSX.Element;
  class?: string;
};

type TooltipGroupContextValue = {
  isWarm: Accessor<boolean>;
  markOpen: () => void;
  markClosed: (cooldown: number) => void;
};

const TooltipGroupContext = createContext<TooltipGroupContextValue>();

function TooltipGroup(props: TooltipGroupProps) {
  const [isWarm, setIsWarm] = createSignal(false);
  let openCount = 0;
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined;

  function clearCooldown() {
    if (cooldownTimer !== undefined) clearTimeout(cooldownTimer);
    cooldownTimer = undefined;
  }

  const context: TooltipGroupContextValue = {
    isWarm,
    markOpen: () => {
      openCount += 1;
      clearCooldown();
      setIsWarm(true);
    },
    markClosed: (cooldown) => {
      openCount = Math.max(0, openCount - 1);
      if (openCount > 0) return;
      clearCooldown();
      if (cooldown === 0) {
        setIsWarm(false);
        return;
      }
      cooldownTimer = setTimeout(() => {
        cooldownTimer = undefined;
        setIsWarm(false);
      }, cooldown);
    },
  };

  onCleanup(clearCooldown);

  return (
    <TooltipGroupContext.Provider value={context}>
      {props.children}
    </TooltipGroupContext.Provider>
  );
}

function TooltipRoot(props: TooltipRootProps) {
  const group = useContext(TooltipGroupContext);
  let isOpenInGroup = false;
  const resolvedOpenDelay = () => {
    if (group?.isWarm()) return 0;
    return props.openDelay ?? DEFAULT_TOOLTIP_OPEN_DELAY;
  };
  const resolvedCloseDelay = () =>
    props.closeDelay ?? DEFAULT_TOOLTIP_CLOSE_DELAY;

  onCleanup(() => {
    if (isOpenInGroup) group?.markClosed(0);
  });

  return (
    <ArkTooltip.Root
      lazyMount
      unmountOnExit
      openDelay={resolvedOpenDelay()}
      closeDelay={resolvedCloseDelay()}
      closeOnClick
      closeOnEscape
      closeOnPointerDown
      closeOnScroll
      interactive={false}
      disabled={props.disabled}
      open={props.open}
      defaultOpen={props.defaultOpen}
      ids={props.triggerId ? { trigger: props.triggerId } : undefined}
      onOpenChange={(details) => {
        if (group && details.open !== isOpenInGroup) {
          isOpenInGroup = details.open;
          if (details.open) group.markOpen();
          else group.markClosed(resolvedCloseDelay());
        }
        props.onOpenChange?.(details.open);
      }}
      positioning={{
        placement: props.placement ?? "top",
        gutter: props.gutter ?? 6,
        flip: true,
        getAnchorRect: props.getAnchorRect,
      }}
    >
      {props.children}
    </ArkTooltip.Root>
  );
}

function TooltipTrigger(props: TooltipTriggerProps) {
  return <ArkTooltip.Trigger {...props} />;
}

function TooltipContent(props: TooltipContentProps) {
  // Fast-tier spring in with a 4px slide from the trigger side; quicker tween out.
  const motion = createPopupMotion();
  return (
    <Portal>
      <ArkTooltip.Positioner class="pw-tooltip-positioner">
        <ArkTooltip.Content
          ref={motion.ref}
          class={`pw-tooltip-content menu-panel pw-texture-button ${props.class ?? ""}`}
        >
          {props.children}
        </ArkTooltip.Content>
      </ArkTooltip.Positioner>
    </Portal>
  );
}

export const Tooltip = {
  Group: TooltipGroup,
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
};
