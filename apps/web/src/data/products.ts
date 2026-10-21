/** The command the site shows for the Polterware CLI. One place to change if the binary is renamed. */
export const CLI = "polterware";

export const REPO_URL = "https://github.com/polterware/polterware";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const INSTALL_SCRIPT = "https://raw.githubusercontent.com/polterware/polterware/main/scripts/install-desktop.sh";

export const installCommand = (app?: "polterware" | "vitals" | "notes") =>
  `curl -fsSL ${INSTALL_SCRIPT} | ${app === "polterware" || app === "notes" ? `APP=${app} ` : ""}bash`;

export type ProductId = "polterware" | "cli" | "notes" | "dispatch" | "vitals";

export type Product = {
  id: ProductId;
  name: string;
  href: string;
  /** One line for menus and cards. */
  summary: string;
  status: string;
};

export const products: Record<ProductId, Product> = {
  polterware: {
    id: "polterware",
    name: "Polterware",
    href: "/polterware",
    summary: "Shared, evidence-backed project context for people and coding agents.",
    status: "Alpha · macOS on Apple Silicon",
  },
  cli: {
    id: "cli",
    name: "Polterware CLI",
    href: "/polterware/cli",
    summary: "Polterware from your terminal: a TUI, scripted reads and writes, and an MCP bridge.",
    status: "Bundled with Polterware · builds from source",
  },
  notes: {
    id: "notes",
    name: "Polterware Notes",
    href: "/notes",
    summary: "Local-first notes and reminders that people and coding agents share.",
    status: "Alpha · macOS on Apple Silicon",
  },
  dispatch: {
    id: "dispatch",
    name: "Dispatch",
    href: "/dispatch",
    summary: "Hand a task to the right coding-agent CLI by difficulty, and get a compact result back.",
    status: "In development · CLI",
  },
  vitals: {
    id: "vitals",
    name: "Polterware Vitals",
    href: "/vitals",
    summary: "Watch remote machines over SSH: metrics, processes and a terminal.",
    status: "Alpha · macOS on Apple Silicon",
  },
};

export const productList: Product[] = [products.polterware, products.cli, products.notes, products.dispatch, products.vitals];
