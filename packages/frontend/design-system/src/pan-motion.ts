/**
 * One-axis pan motion for a pager: it follows the input 1:1 and snaps to a target on a spring
 * that starts on the release frame and carries the release velocity, so a flick lands firmly
 * instead of restarting from rest. Interruptible: `stop` returns the value on screen, so a
 * grab mid-snap continues from where the content is drawn. Reduced motion commits at once.
 */
import { animate, motionValue, type AnimationPlaybackControls } from "motion";
import { prefersReducedMotion } from "./reduced-motion";
import { spring } from "./springs";

export type PanMotion = {
  /** The value on screen. */
  get: () => number;
  /** Track the input, no spring. Stops a running snap. */
  follow: (value: number) => void;
  /** Spring to `target` from the value on screen. Resolves true when it landed, false when interrupted. */
  snap: (target: number, options?: { velocity?: number; tier?: keyof typeof spring }) => Promise<boolean>;
  /** Stop a running snap where it is and return the value on screen. */
  stop: () => number;
  dispose: () => void;
};

export function createPanMotion(paint: (value: number) => void): PanMotion {
  const value = motionValue(0);
  const unsubscribe = value.on("change", paint);
  let running: AnimationPlaybackControls | undefined;
  let landed: ((done: boolean) => void) | undefined;

  const interrupt = () => {
    if (running) {
      // `stop` samples the spring at the current time, ahead of the last painted frame; keep what is on screen.
      const drawn = value.get();
      running.stop();
      value.jump(drawn);
    }
    running = undefined;
    landed?.(false);
    landed = undefined;
  };

  return {
    get: () => value.get(),
    follow(next) {
      interrupt();
      value.set(next);
    },
    snap(target, options = {}) {
      interrupt();
      if (prefersReducedMotion() || value.get() === target) {
        value.jump(target);
        return Promise.resolve(true);
      }
      const { exit: _exit, ...tier } = spring[options.tier ?? "fast"];
      return new Promise<boolean>((resolve) => {
        landed = resolve;
        running = animate(value, target, {
          ...tier,
          // Velocity is in units per second; the spring inherits the flick instead of starting still.
          velocity: options.velocity ?? value.getVelocity(),
          onComplete: () => {
            running = undefined;
            landed = undefined;
            value.jump(target);
            resolve(true);
          },
        });
      });
    },
    stop() {
      interrupt();
      return value.get();
    },
    dispose() {
      interrupt();
      unsubscribe();
    },
  };
}
