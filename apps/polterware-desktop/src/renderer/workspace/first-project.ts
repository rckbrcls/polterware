/**
 * When the local core responds and no projects exist, the Desktop opens the
 * create-project dialog instead of Architecture with an empty workspace.
 */
export function shouldOpenCreateProject(input: {
  coreAvailable: boolean;
  projectCount: number;
}): boolean {
  return input.coreAvailable && input.projectCount === 0;
}
