import type { Context } from '@actions/github/lib/context';
import type { GitHub } from '@actions/github/lib/utils';
import type * as core from '@actions/core';
import type * as github from '@actions/github';
import type * as glob from '@actions/glob';
import type * as io from '@actions/io';
import type * as exec from '@actions/exec';

interface Repository {
  name: string;
  fork: boolean;
  private: boolean;
  visibility: string;
  description: string;
  homepage: string;
  owner: { login: string };
  parent?: {
    owner: { login: string };
    name: string;
    description?: string;
    homepage?: string;
    full_name: string;
  };
  url: string;
}

class DescTags {
  private tags: string[];
  private description: string;

  constructor(description: string) {
    const [tags, remainingDescription] = this.parseDescription(description);
    this.tags = tags;
    this.description = remainingDescription;
  }

  private parseDescription(description: string): [string[], string] {
    const regex = /^(\s*\[[A-Z][A-Z0-9-]+[A-Z0-9]\]\s*)+/;
    const match = description.match(regex);

    if (match) {
      const tagSection = match[0];
      const tags = tagSection.match(/\[([A-Z][A-Z0-9-]+[A-Z0-9])\]/g)?.map(tag => tag.slice(1, -1)) || [];
      const remainingDescription = description.slice(tagSection.length).trim();
      return [tags, remainingDescription];
    }

    return [[], description.trim()];
  }

  ensureTag(tag: string): void {
    this.tags = this.tags.filter(t => t === tag);
    // Add the tag to the beginning
    this.tags.unshift(tag);
  }

  toString(): string {
    const tagsString = this.tags.map(tag => `[${tag}]`).join(' ');
    return tagsString + (this.description ? ' ' + this.description : '');
  }

  getDescription(): string {
    return this.description;
  }
}

interface Prevent {
  [key: string]: boolean;
  get: (key: string) => boolean;
  log: () => void;
}

export default async function main(
  github: InstanceType<typeof GitHub>,
  context: Context,
  core: typeof import('@actions/core'),
  glob: typeof import('@actions/glob'),
  io: typeof import('@actions/io'),
  exec: typeof import('@actions/exec'),
  require: NodeRequire
): Promise<void> {
  const assert = (condition: boolean, message?: string): void => {
    if (!condition) throw new Error(message || "Assertion failed");
  };

  const { FORK_TAG_NAME } = process.env;
  if (!FORK_TAG_NAME || FORK_TAG_NAME.length <= 3) {
    throw new Error(`Invalid fork tag name '${FORK_TAG_NAME}'`);
  }

  const PREVENT: Prevent = {
    get: (key: string) => PREVENT[key.toUpperCase()] as boolean,
    log: () => console.log({ PREVENT }),
  };

  const preventFlagNames = [
    'ALL_UPDATES',
    'NAME_UPDATES',
    'DESCRIPTION_UPDATES',
    'HOMEPAGE_UPDATES',
  ];

  preventFlagNames.forEach(name => {
    PREVENT[name.toUpperCase().replace('PREVENT_', '')] = core.getBooleanInput('PREVENT_' + name.toUpperCase());
  });

  PREVENT.log();
  core.debug(JSON.stringify({ PREVENT }));

  async function processRepository(repo: Repository): Promise<{ repo: Repository; changedProps: Record<string, { old: string; new: string }> }> {
    core.info(`Processing repo: '${repo.name}'`);
    if (!repo.fork) {
      throw new Error(`Repo '${repo.name}' is not a fork!`);
    }
    if (repo.private || repo.visibility !== 'public') {
      throw new Error(`Repo '${repo.name}' is not public!`);
    }

    const forkTag = FORK_TAG_NAME.toUpperCase();
    const descTags = new DescTags(repo.description);
    descTags.ensureTag(forkTag);

    const expectedProps = {
      'name': `${repo.parent!.owner.login}--${repo.parent!.name}--${FORK_TAG_NAME}`,
      'description': descTags.toString(),
      'homepage': repo.parent!.homepage || '',
    };

    const changedProps: Record<string, { old: string; new: string }> = {};

    Object.entries(expectedProps).forEach(([name, value]) => {
      if (repo[name as keyof typeof expectedProps] !== value) {
        const change = { old: repo[name as keyof typeof expectedProps], new: value };
        const preventUpdate = !(!PREVENT.get('ALL_UPDATES') && !PREVENT.get(`${name.toUpperCase()}_UPDATES`));
        const warningText = [
          `Changing ${name}!`,
          `From '${change.old}'.`,
          `To '${change.new}'.`,
          ...(preventUpdate ? [`🙊 Change prevented because of 'PREVENT_*' flags.`] : [])
        ].join('\n');
        core.warning(warningText, { title: repo.parent!.full_name });
        if (!preventUpdate) {
          changedProps[name] = change;
        }
      }
    });

    if (Object.keys(changedProps).length) {
      const updateData: any = {
        owner: repo.owner.login,
        repo: repo.name,
        ...Object.fromEntries(Object.entries(changedProps).map(([propName, change]) => [propName, change.new]))
      };
      repo = (await github.rest.repos.update(updateData)).data;
      core.info(`✅ Changes applied successfully for repo '${repo.name}'`);
    } else {
      core.info(`💯 No changes for repo '${repo.name}'`);
    }
    return { repo, changedProps };
  }

  const changeSet: Record<string, Record<string, { old: string; new: string }>> = {};
  const errors: Error[] = [];
  const search_query = `user:@me is:public fork:true topic:${FORK_TAG_NAME}`;
  const request = await github.rest.search.repos.endpoint.merge({ q: search_query });

  for await (const response of github.paginate.iterator(request)) {
    for (let repo of response.data) {
      try {
        repo = (await github.request(repo.url)).data;
      } catch (error) {
        core.error(`${error}`);
        errors.push(error as Error);
        continue;
      }
      await core.group(repo.parent!.full_name, async () => {
        try {
          const result = await processRepository(repo);
          repo = result.repo;
          if (Object.keys(result.changedProps).length) {
            changeSet[JSON.stringify(repo)] = result.changedProps;
          }
        } catch (error) {
          core.error(`${error}`);
          errors.push(error as Error);
        }
      });
    }
  }

  if (errors.length) {
    core.setFailed(`🔥 There were errors while processing repositories, check the log.`);
    core.summary
      .addHeading("🔥 Errors happened :exclamation:")
      .addList(errors.map(e => e.message))
      .write();
    return;
  }

  if (Object.keys(changeSet).length) {
    const summary = core.summary
      .addHeading("✨ Some changes were made")
      .addHeading(`Check them out 🧐`, 2);

    Object.entries(changeSet).forEach(([repoJSON, props]) => {
      const repo: Repository = JSON.parse(repoJSON);
      const diff = Object.entries(props).map(([prop, { old, new: newVal }]) =>
        [
          `-${prop}: ${JSON.stringify(old)}`,
          `+${prop}: ${JSON.stringify(newVal)}`,
        ].join(`\n`)
      ).join(`\n`);
      summary
        .addHeading(`<a href="https://github.com/${repo.owner.login}/${repo.parent!.full_name.replace('/', '--')}--${FORK_TAG_NAME}">${repo.parent!.full_name}</a>`, 3)
        .addCodeBlock(diff, 'diff');
    });

    summary.write();
  } else {
    core.summary
      .addHeading("💯✅ No changes, no errors")
      .write();
  }
}
