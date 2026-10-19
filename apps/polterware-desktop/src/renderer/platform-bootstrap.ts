import {
  LOCAL_CAPABILITIES,
  type PlatformContext,
} from "@polterware/frontend-platform";

export function bootstrapPlatform(): PlatformContext {
  return {
    mode: "local",
    capabilities: LOCAL_CAPABILITIES,
  };
}
