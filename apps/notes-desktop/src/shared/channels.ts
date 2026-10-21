// Frozen notes-contracts-v1.1 unary bridge allowlist.
export const RPC_METHODS = {
  "notes": [
    "list",
    "get",
    "create",
    "update",
    "delete",
    "setStatus",
    "setPinned",
    "reorder",
    "toggleCheckItem",
    "replaceChecklist",
    "setTags",
    "bulkAction"
  ],
  "spaces": [
    "list",
    "get",
    "create",
    "update",
    "delete",
    "reorder"
  ],
  "tags": [
    "list",
    "create",
    "update",
    "delete",
    "merge"
  ],
  "schedule": [
    "set",
    "clear",
    "preview",
    "listOccurrences",
    "completeOccurrence",
    "reopenOccurrence",
    "setFocusRecipe"
  ],
  "places": [
    "set",
    "clear",
    "listInBounds"
  ],
  "attachments": [
    "importFromPath",
    "addLink",
    "list",
    "delete",
    "reorder",
    "openInfo"
  ],
  "focus": [
    "getDefaults",
    "setDefaults",
    "recordSession",
    "listSessions"
  ],
  "review": [
    "get"
  ],
  "search": [
    "search",
    "status",
    "reindex"
  ],
  "reminders": [
    "plan",
    "ack",
    "snooze",
    "armOneOff",
    "cancelOneOff",
    "heartbeat",
    "status"
  ],
  "activity": [
    "list"
  ],
  "settings": [
    "get",
    "set"
  ],
  "agents": [
    "getInfo",
    "rotateToken",
    "setEnabled",
    "setAllowFileAttach"
  ],
  "maintenance": [
    "export",
    "backup",
    "doctor"
  ]
} as const;
