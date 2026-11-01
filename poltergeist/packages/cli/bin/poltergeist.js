#!/usr/bin/env node
// Runs the TypeScript sources through tsx: no build step yet (D-36, KI-33).
import process from 'node:process';
import { register } from 'tsx/esm/api';

register();
const { main } = await import('../src/main.ts');
process.exitCode = await main(process.argv.slice(2));
