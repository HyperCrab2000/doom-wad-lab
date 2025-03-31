import path from 'path';
import fs from 'fs/promises';
import puppeteer from 'puppeteer';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http-server';

const TEST_FOLDER = path.resolve(__dirname);
const KVX_FILE_PATH = path.resolve(TEST_FOLDER, './SARGC.kvx');
const PORT = 8080; // 🚀 Local server port
const TEST_PAGE_URL = `http://localhost:${PORT}/voxelRendererTest.html`;

let server: Server;

describe('Voxel Renderer Test', () => {
  beforeAll(async () => {
    // 🖥️ Start a local HTTP server to serve the test files
    server = createServer({
      root: TEST_FOLDER, // Serve the test directory
    });

    server.listen(PORT, () => {
      console.log(`🌐 Test server running at ${TEST_PAGE_URL}`);
    });
  });

  afterAll(() => {
    if (server) {
      server.close();
      console.log('🛑 Test server stopped');
    }
  });

  it('should load the voxel model and render it correctly', async () => {
    const browser = await puppeteer.launch({
      headless: false, // Set to false to see the window
    });

    const page = await browser.newPage();

    // ✅ Load page from the local HTTP server
    await page.goto(TEST_PAGE_URL);

    // ✅ Inject KVX data as ArrayBuffer from the server
    await page.exposeFunction('loadKvxFile', async () => {
      const kvxBuffer = await fs.readFile(KVX_FILE_PATH);
      return Array.from(new Uint8Array(kvxBuffer));
    });

    // ✅ Run render function from window
    const result = await page.evaluate(async () => {
      if (typeof window.renderVoxelMesh === 'function') {
        const kvxDataArray = await window.loadKvxFile();
        const kvxData = new Uint8Array(kvxDataArray).buffer;
        return await window.renderVoxelMesh(kvxData);
      }
      return { success: false, error: 'renderVoxelMesh not defined!' };
    });

    // 🎯 Check rendering result
    expect(result.success).toBe(true);
    console.log('✅ Voxel rendered successfully!');

    // 🖼️ Delay to visually inspect the result
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await browser.close();
  });
});
