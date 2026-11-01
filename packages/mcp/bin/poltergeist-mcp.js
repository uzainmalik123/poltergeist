#!/usr/bin/env node
// Runs the TypeScript sources through tsx: no build step yet (D-36, D-38, KI-33).
import process from 'node:process';
import { register } from 'tsx/esm/api';

register();
const { runStdio } = await import('../src/main.ts');
process.exitCode = await runStdio(process.argv.slice(2));
