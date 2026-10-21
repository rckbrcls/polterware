// Vitals IPC allowlist.
export const IPC_CHANNELS = {
  shell: {
    open: "vitals:shell-open",
    write: "vitals:shell-write",
    resize: "vitals:shell-resize",
    close: "vitals:shell-close",
    ack: "vitals:shell-ack",
  },
  session: {
    connect: "vitals:connect",
    disconnect: "vitals:disconnect",
    listServers: "vitals:list-servers",
    deleteServer: "vitals:delete-server",
    hostKeyAccept: "vitals:host-key-accept",
    hostKeyReject: "vitals:host-key-reject",
    killProcess: "vitals:kill-process",
  },
  settings: { get: "vitals:get-settings", update: "vitals:update-settings" },
  knownHosts: { list: "vitals:list-known-hosts", remove: "vitals:remove-known-host" },
  theme: {
    get: "vitals:get-theme",
    set: "vitals:set-theme",
  },
} as const;

export const IPC_EVENTS = {
  settings: { changed: "vitals:settings-changed" },
  shell: {
    data: "vitals:shell-data",
    exit: "vitals:shell-exit",
  },
  connection: {
    state: "vitals:connection-state",
  },
  metrics: {
    snapshot: "vitals:metrics",
  },
  hostKey: {
    prompt: "vitals:host-key-prompt",
  },
} as const;
