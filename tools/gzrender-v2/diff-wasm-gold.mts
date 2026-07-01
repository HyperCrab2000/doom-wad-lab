import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';

const left = process.argv[2] ?? 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png';
const right = process.argv[3] ?? `artifacts/gzrender-v2/gzdoom-wasm/${process.argv[2] ?? 'E1M1'}.png`;
const r = await diffPlayfieldPngFiles(left, right, { tolerance: 0 });
console.log(formatFrameDiff(r));
