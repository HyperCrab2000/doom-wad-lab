#!/usr/bin/env npx tsx
/**
 * Audit courtyard visibility across DOOM / DOOM2 IWADs.
 * Run: npx tsx scripts/audit-courtyard-visibility.ts
 */
import fs from 'node:fs';
import path from 'node:path';

import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer.ts';
import {
  checkCourtyardSnapshot,
  shouldApplyCourtyardConnectivityRules,
  type CourtyardInvariantViolation,
} from '../src/wad/renderer/courtyard/courtyardInvariants.ts';
import { discoverCourtyardsInWad } from '../src/wad/renderer/courtyard/discoverCourtyards.ts';
import {
  COURTYARD_PROBE_YAWS,
  createCourtyardProbeContext,
  islandForCameraSector,
  probeCourtyardVisibility,
} from '../src/wad/renderer/courtyard/probeCourtyardVisibility.ts';

function loadWad(relativePath: string) {
  const wadPath = path.resolve(process.cwd(), relativePath);
  const buf = fs.readFileSync(wadPath);
  return loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

function auditWad(label: string, relativePath: string) {
  const wad = loadWad(relativePath);
  const analyses = discoverCourtyardsInWad(wad);
  let probes = 0;
  let violations: CourtyardInvariantViolation[] = [];

  let drawViolations = 0;
  let connectivityViolations = 0;

  for (const analysis of analyses) {
    const ctx = createCourtyardProbeContext(wad.maps[analysis.mapName], analysis);
    if (!ctx) continue;

    for (const probe of analysis.probes) {
      for (const viewYaw of COURTYARD_PROBE_YAWS) {
        probes++;
        const snapshot = probeCourtyardVisibility(ctx, probe, viewYaw);
        if (!snapshot) continue;

        const island = islandForCameraSector(
          ctx.map,
          analysis,
          snapshot.cameraSectorIndex
        );
        if (!island) continue;

        const applyConnectivity = shouldApplyCourtyardConnectivityRules(
          ctx.map,
          analysis.index,
          analysis.skyIslandIds,
          probe,
          snapshot.cameraSectorIndex
        );

        const snapshotViolations = checkCourtyardSnapshot(
          ctx.map,
          analysis.index,
          analysis.skyIslandIds,
          island,
          snapshot,
          { connectivityRules: applyConnectivity }
        );

        for (const v of snapshotViolations) {
          if (v.rule.startsWith('draw-')) drawViolations++;
          else connectivityViolations++;
          violations.push(v);
        }
      }
    }
  }

  console.log(
    `${label}: ${analyses.length} maps, ${probes} probe×yaw checks, ${drawViolations} draw + ${connectivityViolations} connectivity violations`
  );
  if (violations.length > 0) {
    for (const v of violations.slice(0, 20)) {
      console.log(`  [${v.rule}] ${v.detail}`);
    }
  }
  return violations.length;
}

const total =
  auditWad('DOOM', 'public/wads/DOOM.WAD') +
  auditWad('DOOM2', 'public/wads/DOOM2.WAD');

process.exit(total > 0 ? 1 : 0);
