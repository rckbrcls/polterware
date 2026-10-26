import { BotAvatar, type BotAvatarProps } from "@polterware/bot-avatars";

/**
 * The Polterware mascot: the ghost with a green antenna, the same one the CLI prints.
 * Use this wherever the product needs a face; do not substitute another bot body.
 */
export function PolterMascot(props: Omit<BotAvatarProps, "type">) {
  return <BotAvatar shading="fabric" furLength={1} furDensity={1.6} furFuzz={0.9} {...props} type="ghost" />;
}
