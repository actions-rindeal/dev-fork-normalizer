#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import yaml from 'js-yaml';


async function validateFilePath(filePath) {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return path.resolve(filePath);
  } catch {
    throw new Error(`Invalid or inaccessible file path: ${filePath}`);
  }
}

async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <compiledJs> <actionInYml> <actionYml>')
    .demandCommand(3, 'Please provide all three arguments: compiledJs, actionInYml, and actionYml')
    .argv;

  const { _: [compiledJs, actionInYml, actionYml] } = argv;
  const [compiledJsPath, actionInYmlPath, actionYmlPath] = await Promise.all([
    validateFilePath(compiledJs),
    validateFilePath(actionInYml),
    path.resolve(actionYml),
  ]);

  console.log('Compiling TypeScript...');
  execSync('tsc', { stdio: 'inherit' });

  const [compiledJs, actionConfig] = await Promise.all([
    fs.readFile(compiledJsPath, 'utf8'),
    fs.readFile(actionInYmlPath, 'utf8').then(yaml.load),
  ]);

  const tsFilePath = compiledJsPath.replace(/\.js$/, '.ts');
  const [tsHash, tsStats] = await Promise.all([
    hashFile(tsFilePath),
    fs.stat(tsFilePath),
  ]);

  actionConfig.runs.steps[0].with.script = `
// TypeScript file info:
//   Filename: ${path.basename(tsFilePath)}
//   Last modified: ${tsStats.mtime.toISOString()}
//   SHA256: ${tsHash}

const main = ${compiledJs}

main(github, context, core, glob, io, exec, require);
`;
  
  const updatedActionYml = yaml.dump(actionConfig, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  });

  await fs.writeFile(actionYmlPath, updatedActionYml);

  console.log('Build complete. action.yml has been updated with the compiled script and version info.');
}

main()
