/** Desktop releases ship without an update feed (see tooling/release). */
export const updateStatus = "disabled" as const;
// No update checks, downloads or installs before a signed release feed is approved.
