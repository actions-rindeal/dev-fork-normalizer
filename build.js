#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const yargs = require('yargs');
const yaml = require('js-yaml');

// Define command-line options
const argv = yargs
  .usage('Usage: $0 [options] <compiledJs> <actionInYml> <actionYml>')
  .option('h', {
    alias: 'help',
    describe: 'Show help',
  })
  .demandCommand(3, 'Please provide all three arguments: compiledJs, actionInYml, and actionYml')
  .argv;

// Compile TypeScript
console.log('Compiling TypeScript...');
execSync('tsc', { stdio: 'inherit' });

// Read the compiled JavaScript
const compiledJs = fs.readFileSync(path.join(__dirname, argv.compiledJs), 'utf8');

// Parse the YAML
const actionConfig = yaml.load(fs.readFileSync(path.join(__dirname, argv.actionInYml), 'utf8'));

// Update the script field
actionConfig.runs.steps[0].with.script = `
  const main = ${compiledJs}
  main(github, context, core, glob, io, exec, require);
`;

// Convert back to YAML, preserving comments and formatting
const updatedActionYml = yaml.dump(actionConfig, {
  lineWidth: -1,
  noRefs: true,
  quotingType: '"',
});

// Write the updated action.yml file
fs.writeFileSync(path.join(__dirname, argv.actionYml), updatedActionYml);

console.log('Build complete. action.yml has been updated with the compiled script.');
