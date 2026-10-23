export const REPO_URL = "https://github.com/rckbrcls/polterware";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const INSTALL_SCRIPT = "https://polterware.com/install.sh";

/** Only Vitals ships today; the installer defaults to it. */
export const installCommand = () => `curl -fsSL ${INSTALL_SCRIPT} | APP=vitals bash`;

export const vitals = {
  name: "Polterware Vitals",
  summary: "Watch remote machines over SSH: metrics, processes and a terminal.",
  status: "Alpha · macOS on Apple Silicon",
};
