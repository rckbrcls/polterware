/**
 * When the local core responds and no projects exist, the Projects screen
 * opens the create-project dialog.
 */
export function shouldOpenCreateProject(input: {
  coreAvailable: boolean;
  projectCount: number;
}): boolean {
  return input.coreAvailable && input.projectCount === 0;
}
