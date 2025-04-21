import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const OUTPUT_DIR = path.resolve(__dirname, 'voxelScreenshots');
const OUTPUT_IMAGE_PATH = path.join(OUTPUT_DIR, 'SARGC_voxel_transformed.png');

describe('Voxel WebGL Rendering Tests', () => {
  let browser: any;
  let page: any;

  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: true });
    page = await browser.newPage();
    const htmlPath = `file://${path.resolve(__dirname, 'voxelRendererTest.html')}`;
    await page.goto(htmlPath);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should render voxel mesh correctly with WebGL', async () => {
    const result = await page.evaluate(async () => {
      return await window.renderVoxelMesh();
    });

    expect(result.success).toBe(true);

    // Take a screenshot to compare visually
    const screenshotBuffer = await page.screenshot();
    await fs.writeFile(OUTPUT_IMAGE_PATH, screenshotBuffer);
    console.log(`✅ Voxel screenshot saved to ${OUTPUT_IMAGE_PATH}`);

    // Assert screenshot existence
    const stats = await fs.stat(OUTPUT_IMAGE_PATH);
    expect(stats.size).toBeGreaterThan(5000);
  });
});
