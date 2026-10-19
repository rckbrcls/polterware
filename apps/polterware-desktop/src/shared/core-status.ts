/** Lifecycle of the local core (`polterware serve`) as seen by the Desktop. */
export type CoreStatus = {
  state: "running" | "stopped" | "starting" | "stopping" | "error";
  pid: number | null;
  endpoint: string | null;
  dbPath: string;
  logPath: string;
  error: string | null;
};
