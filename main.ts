// declare module '@actions/github' {
  // export const context: any;
  // export function getOctokit(token: string): any;
// }

// declare module '@actions/core' {
  // export function getInput(name: string, options?: { required?: boolean }): string;
  // export function getBooleanInput(name: string, options?: { required?: boolean }): boolean;
  // export function setFailed(message: string | Error): void;
// }

// declare module '@actions/glob' {}
// declare module '@actions/io' {}
// declare module '@actions/exec' {}

export default async function main(
  github: typeof import('@actions/github'),
  context: typeof import('@actions/github').context,
  core: typeof import('@actions/core'),
  glob: typeof import('@actions/glob'),
  io: typeof import('@actions/io'),
  exec: typeof import('@actions/exec'),
  require: NodeRequire
) {
  try {
    const forkTagName = core.getInput('tag') || 'dev-fork';
    const preventPermanentChanges = core.getBooleanInput('prevent-all-updates');
    const preventNameUpdates = core.getBooleanInput('prevent-name-updates');
    const preventDescriptionUpdates = core.getBooleanInput('prevent-description-updates');
    const preventHomepageUpdates = core.getBooleanInput('prevent-homepage-updates');

    // Your existing logic here, using the input values
    // Use github, context, core, glob, io, exec, and require as needed
    // ...

  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}
