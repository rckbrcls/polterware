export const CARD_IDS = ["cpu", "memory", "network", "diskio", "pressure", "disk", "thermal", "processes"] as const;

export type CardId = (typeof CARD_IDS)[number];

export const CARD_TITLES: Record<CardId, string> = {
  cpu: "CPU",
  memory: "Memory",
  network: "Network",
  diskio: "Disk I/O",
  pressure: "Pressure",
  disk: "Disk",
  thermal: "Temperature / GPU",
  processes: "Processes",
};
