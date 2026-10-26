import { PolterMascot } from "./mascot";

export type EmptyBotMood = "sleeping" | "sad" | "lost";

/** The Polterware mascot as an empty-state face: asleep, sad, or lost. */
export function EmptyBot(props: { mood?: EmptyBotMood; size?: number }) {
  const mood = () => props.mood ?? "sleeping";
  return (
    <PolterMascot
      state={mood() === "sleeping" ? "sleeping" : "default"}
      face={mood() === "sad" ? "mouth" : "eyes"}
      size={props.size ?? 64}
      aria-hidden="true"
      jumpEvery={0}
      turn={mood() === "lost" ? 1 : 0.35}
    />
  );
}
