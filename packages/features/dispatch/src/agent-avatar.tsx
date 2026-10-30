import { BotAvatar, agentMarkFor, botAvatarTypes, type BotAvatarType } from "@polterware/bot-avatars";

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

function dispatchBotState(status?: string): "working" | "sleeping" | "default" {
  const value = status?.toLowerCase();
  if (value === "pending" || value === "running") return "working";
  if (value === "failed" || value === "cancelled" || value === "canceled" || value === "timed_out") return "sleeping";
  return "default";
}

/** An agent's bot: its own mark when it has one, else a type and seed from its name; it moves while the run works. */
export function DispatchAgentAvatar(props: { agent?: string; seed?: string; status?: string; size?: number }) {
  const key = () => props.agent?.trim() || "agent";
  const mark = () => agentMarkFor(key());
  const state = () => dispatchBotState(props.status);
  const working = () => state() === "working";
  return (
    <BotAvatar
      type={mark()?.type ?? botTypeFor(key())}
      color={mark()?.color}
      state={state()}
      size={props.size ?? 28}
      seed={seedFor(props.seed || key())}
      shading="fabric"
      furLength={1}
      furDensity={1.6}
      furFuzz={0.9}
      aria-hidden="true"
      {...(working() ? {} : { jumpEvery: 0, turn: 0.35 })}
    />
  );
}
