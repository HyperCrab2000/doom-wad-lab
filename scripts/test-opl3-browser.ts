/**
 * Browser integration test: loads /vendor/opl3.js and decodes MAP01 music from DOOM2.WAD.
 * Requires dev server: npm run dev
 */
import { readFileSync, existsSync } from 'fs';
import puppeteer from 'puppeteer';
import { loadWadFromArrayBuffer } from '../src/wad/parser/loadWadFromArrayBuffer';
import { getGenmidiFromWad, getMusicLump } from '../src/features/level-viewer/music/doomMusic';

const BASE_URL = process.env.OPL3_TEST_URL ?? 'http://127.0.0.1:5173';
const WAD_PATH = 'public/wads/DOOM2.WAD';

async function main(): Promise<void> {
  if (!existsSync(WAD_PATH)) {
    console.error(`Missing ${WAD_PATH} — cannot verify MUS decode.`);
    process.exit(1);
  }

  const wadBytes = readFileSync(WAD_PATH);
  const wad = loadWadFromArrayBuffer(
    wadBytes.buffer.slice(wadBytes.byteOffset, wadBytes.byteOffset + wadBytes.byteLength)
  );
  const lump = getMusicLump(wad, 'MAP01');
  const genmidi = getGenmidiFromWad(wad);

  if (!lump) {
    throw new Error('D_RUNNIN not found in DOOM2.WAD');
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const bundleStatus = await page.goto(`${BASE_URL}/vendor/opl3.js`, { waitUntil: 'networkidle0' });
    if (!bundleStatus?.ok()) {
      throw new Error(`OPL3 bundle HTTP ${bundleStatus?.status() ?? 'unknown'}`);
    }

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    const musBytes = [...new Uint8Array(lump.data)];
    const genmidiBytes = genmidi ? [...new Uint8Array(genmidi)] : null;

    const result = await page.evaluate(async (musArray, genmidiArray) => {
      const mus = Uint8Array.from(musArray).buffer;
      const genmidi = genmidiArray ? Uint8Array.from(genmidiArray).buffer : undefined;

      await new Promise((resolve, reject) => {
        const win = window as Window & { OPL3?: { Player: any; format: { MUS: any } } };
        if (win.OPL3?.Player) {
          resolve(undefined);
          return;
        }
        const script = document.createElement('script');
        script.src = '/vendor/opl3.js';
        script.onload = () => resolve(undefined);
        script.onerror = () => reject(new Error('OPL3 script failed to load'));
        document.head.appendChild(script);
      });

      const win = window as Window & { OPL3: { Player: any; format: { MUS: any } } };
      const decoder = new win.OPL3.Player(win.OPL3.format.MUS, {
        disableWorker: true,
        instruments: genmidi,
      });
      const pcm = await decoder.load(mus);

      const ctx = new AudioContext();
      await ctx.close();

      return {
        pcmBytes: pcm?.byteLength ?? 0,
        audioContextOk: typeof AudioContext !== 'undefined',
      };
    }, musBytes, genmidiBytes);

    if (result.pcmBytes <= 1000) {
      throw new Error(`MAP01 MUS decode too small: ${result.pcmBytes} bytes`);
    }

    console.log(
      `OK: decoded ${lump.name} (${lump.data.byteLength} byte MUS) -> ${result.pcmBytes} bytes PCM`
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
