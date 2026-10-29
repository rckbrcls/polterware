import { Show } from "solid-js";
import { BotAvatar, agentMarkFor, botAvatarTypes, type BotAvatarType } from "@polterware/bot-avatars";
import { IconTile, type IconTileSize } from "@polterware/frontend-design-system";

function hash32(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function botTypeFor(id: string): BotAvatarType {
  return botAvatarTypes[hash32(id) % botAvatarTypes.length] ?? "clover";
}

function seedFor(id: string) {
  return (hash32(id) % 1000) / 1000;
}

function snapIconTileSize(size?: number): IconTileSize {
  if (size === undefined) return 28;
  if (size < 20) return 20;
  if (size <= 20) return 20;
  if (size <= 24) return 24;
  if (size <= 28) return 28;
  return 36;
}

function personInitials(name?: string): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? "";
  const initials = `${first}${second}`.toUpperCase();
  return initials || "?";
}

function botStateFor(runStatus?: string): "working" | "sleeping" | "default" {
  const status = runStatus?.toLowerCase();
  if (status === "open" || status === "running") return "working";
  if (
    status === "failed" ||
    status === "error" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return "sleeping";
  }
  return "default";
}

/** Who made a change: the agent's bot (its mark, animated while its run works), or a person's initials. */
export function ActorIcon(props: {
  actorKind: string;
  agentKey?: string;
  agentLabel?: string;
  seedKey?: string;
  runStatus?: string;
  avatarUrl?: string;
  size?: number;
}) {
  const size = () => snapIconTileSize(props.size);
  const state = () => botStateFor(props.runStatus);
  const isWorking = () => state() === "working";
  const personName = () => props.agentLabel ?? props.agentKey ?? "";
  const mark = () => agentMarkFor(props.agentKey || props.agentLabel || "");

  return (
    <Show
      when={props.actorKind === "human"}
      fallback={
        <BotAvatar
          type={mark()?.type ?? botTypeFor(props.agentKey || "agent")}
          color={mark()?.color}
          state={state()}
          size={props.size ? (props.size < 20 ? 20 : props.size) : 28}
          seed={seedFor(props.seedKey || props.agentKey || "agent")}
          shading="fabric"
          furLength={1}
          furDensity={1.6}
          furFuzz={0.9}
          aria-hidden="true"
          {...(isWorking() ? {} : { jumpEvery: 0, turn: 0.35 })}
        />
      }
    >
      <IconTile
        size={size()}
        tone="identity"
        seed={personName()}
        class="pw-icon-tile--circle"
      >
        <Show
          when={props.avatarUrl}
          fallback={
            <span
              class={`font-medium leading-none select-none ${
                size() <= 20 ? "text-[10px]" : "text-[11.5px]"
              }`}
            >
              {personInitials(personName())}
            </span>
          }
        >
          {(url) => (
            <img
              src={url()}
              alt=""
              class="rounded-full object-cover"
              style={{
                width: `${Math.round(size() * 0.68)}px`,
                height: `${Math.round(size() * 0.68)}px`,
                "object-fit": "cover",
                "border-radius": "999px",
              }}
            />
          )}
        </Show>
      </IconTile>
    </Show>
  );
}
