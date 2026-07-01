#!/usr/bin/env npx tsx
/** Print space-separated CLI args for a display mode (used by bash capture scripts). */
import { buildParityCaptureArgv, parseDisplayModeId } from '../../src/gzdoom-oracle/parityDisplayModes.ts';

const mode = parseDisplayModeId(process.argv[2] ?? 'full');
const argv = buildParityCaptureArgv(mode);
process.stdout.write(`${argv.join(' ')}\n`);
