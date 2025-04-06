/**
 * Slab6-like KVX loader with 3-pass marking, flood fill, and face visibility.
 *
 * Translated from Ken Silverman's Slab6 approach:
 *   1) Read KVX header (xsiz, ysiz, zsiz, xpiv, ypiv, zpiv).
 *   2) Read xstart[] and xyoffs[][].
 *   3) PASS 1: Mark slabs with setzrange1(), skip color bytes.
 *   4) Flood fill from edges to mark outside bits in vbit[].
 *   5) PASS 2: Clear those slabs with setzrange0(), skip color bytes.
 *   6) PASS 3: Actually read color bytes into voxel array. Use getvis() to get face visibility.
 *   7) Read palette from last 768 bytes, checkpalimito64(), initclosestcolorfast() if you want.
 *
 * We store final voxel data in `voxdata[]`, with { x, y, z, col, vis }.
 * We also store palette in `fipalette` (possibly shifted if needed).
 *
 * Then you can draw top/front/side (or do your own rendering).
 */

/* ---------------- CONSTANTS & GLOBALS ----------------- */

// For Slab6 defaults:
export const MAXXSIZ = 256;
export const MAXYSIZ = 256;
export const BUFZSIZ = 256;  // must be >= zsiz
export const LIMZSIZ = 255;  // Slab6 uses 255

// Maximum number of voxels
export const MAXVOXS = 1048576;

// The bit array for marking surface/in/out
// In Slab6: static long vbit[(MAXXSIZ*MAXYSIZ*BUFZSIZ)>>5];
const VBIT_SIZE = ((MAXXSIZ * MAXYSIZ * BUFZSIZ) >> 5);
let vbit = new Uint32Array(VBIT_SIZE);

// Slab6 also had vbit2, but that’s for MIP stuff, not mandatory for basic load
// static long vbit2[(MAXXSIZ*MAXYSIZ*BUFZSIZ)>>(5+3)]; // not used here

// BFS buffer for flood fill
// #define FILLBUFSIZ 8192
const FILLBUFSIZ = 8192;
interface Cpoint4d { x: number; y: number; z0: number; z1: number; }
let fbuf: Cpoint4d[] = new Array(FILLBUFSIZ);
for (let i = 0; i < FILLBUFSIZ; i++) {
  fbuf[i] = { x:0, y:0, z0:0, z1:0 };
}

// For storing loaded voxels in final pass
interface VoxType {
  x: number;
  y: number;
  z: number;
  col: number; // color index
  vis: number; // face visibility bits
}
let voxdata: VoxType[] = [];

// For storing how many voxels in each x row / y column, etc.
// Slab6 uses xlen[x], ylen[x][y], but that’s mostly for editing.
// We’ll do it to keep close to Slab6.
let xlen = new Uint16Array(MAXXSIZ);
let ylen: Uint8Array[] = [];
for (let xi=0; xi<MAXXSIZ; xi++) {
  ylen[xi] = new Uint8Array(MAXYSIZ);
}

// Slab6 reads a palette (768 bytes). Then checkpalimito64, then initclosestcolorfast.
let fipalette = new Uint8Array(768);

// A “closest color” table (64*64*64) => 262144
// each entry is 0..255 or 255 if none
const closestcol = new Uint8Array(64*64*64).fill(255);

/* --------------- UTILITY BIT OPS --------------- */

/**
 * BSR: bit scan reverse. Returns index of highest set bit in 'val' (0..31), or -1 if 0.
 */
function bsr(val: number): number {
  if (val === 0) return -1;
  let r = 31;
  while ((val & (1 << r)) === 0) {
    r--;
  }
  return r;
}

/**
 * BSF: bit scan forward. Returns index of lowest set bit in 'val' (0..31), or -1 if 0.
 */
function bsf(val: number): number {
  if (val === 0) return -1;
  let r = 0;
  while ((val & (1 << r)) === 0) {
    r++;
  }
  return r;
}

/** Rotate left 32-bit */
function lrotl(val: number, shift: number): number {
  shift &= 31;
  return ((val << shift) | (val >>> (32 - shift))) >>> 0;
}
/** Rotate right 32-bit */
function lrotr(val: number, shift: number): number {
  shift &= 31;
  return ((val >>> shift) | (val << (32 - shift))) >>> 0;
}

/* --------------- SETZ / CLEARZ (PASS 1 & 2) --------------- */

function setzrange1(xy: number, z0: number, z1: number): void {
  // replicate Slab6
  let start = xy + z0;
  let end   = xy + z1;
  if (((start ^ end) >>> 5) === 0) {
    const block = start >>> 5;
    const mask = (~((-1 >>> 0) << (end & 31))) & ((-1 >>> 0) << (start & 31));
    vbit[block] |= mask;
    return;
  }
  let block = start >>> 5;
  vbit[block] |= ((-1 >>> 0) << (start & 31));
  block++;
  while (block < (end >>> 5)) {
    vbit[block] = 0xffffffff;
    block++;
  }
  const endBlock = end >>> 5;
  const maskEnd  = ~((-1 >>> 0) << (end & 31));
  vbit[endBlock] |= maskEnd;
}

function setzrange0(xy: number, z0: number, z1: number): void {
  let start = xy + z0;
  let end   = xy + z1;
  if (((start ^ end) >>> 5) === 0) {
    const block = start >>> 5;
    // we want to clear bits in [start..end-1]
    const mask = ~((( -1 >>> 0) << (start & 31)) & (~((-1 >>> 0) << (end & 31))));
    vbit[block] &= mask;
    return;
  }
  let block = start >>> 5;
  vbit[block] &= ~(( -1 >>> 0) << (start & 31));
  block++;
  while (block < (end >>> 5)) {
    vbit[block] = 0;
    block++;
  }
  const endBlock = end >>> 5;
  const maskEnd  = (( -1 >>> 0) << (end & 31));
  vbit[endBlock] &= ~maskEnd;
}

/* --------------- UPTIL1 / DNTIL1 / DNTIL0 --------------- */

function uptil1(xy: number, z: number): number {
  // if (!z) return(0);
  if (z <= 0) return 0;
  const pos = xy + (z-1);
  let i = vbit[pos >>> 5] & (~((-1 >>> 0) << ( (pos & 31) +1 )));
  let zBlock = (z-1) & ~31;
  while (i === 0) {
    zBlock -= 32;
    if (zBlock < 0) return 0;
    const newPos = xy + zBlock;
    i = vbit[newPos >>> 5];
  }
  const bitIndex = bsr(i);
  if (bitIndex < 0) return 0;
  return zBlock + bitIndex + 1;
}

function dntil1(xy: number, z: number, zsiz: number): number {
  const pos = xy + z;
  let i = vbit[pos >>> 5] & ((-1 >>> 0) << (pos & 31));
  let zBlock = z & ~31;
  while (i === 0) {
    zBlock += 32;
    if (zBlock >= zsiz) return zsiz;
    const newPos = xy + zBlock;
    i = vbit[newPos >>> 5];
  }
  const bitIndex = bsf(i);
  if (bitIndex < 0) return zsiz;
  return zBlock + bitIndex;
}

function dntil0(xy: number, z: number, zsiz: number): number {
  const pos = xy + z;
  let shift = (pos & 31);
  let mask = ((1 << shift) >>> 0) - 1;
  let i = vbit[pos >>> 5] | mask;
  let zBlock = z & ~31;
  while (i === 0xffffffff) {
    zBlock += 32;
    if (zBlock >= zsiz) return zsiz;
    i = vbit[(xy + zBlock) >>> 5];
  }
  const bitIndex = bsf(~i);
  if (bitIndex < 0) return zsiz;
  return zBlock + bitIndex;
}

/* --------------- FLOODFILL3DBITS --------------- */

function floodfill3dbits(x: number, y: number, z: number,
                         xsiz: number, ysiz: number, zsiz: number)
{
  const xyz = (x*ysiz + y)*BUFZSIZ + z;
  const j = 1 << (xyz & 31);
  if ( (vbit[xyz>>>5] & j) !== 0 ) return; // already set => done

  let z0 = uptil1((x*ysiz + y)*BUFZSIZ, z);
  let z1 = dntil1((x*ysiz + y)*BUFZSIZ, z+1, zsiz);

  setzrange1((x*ysiz + y)*BUFZSIZ, z0, z1);

  let i0 = 0, i1 = 0;
  fbuf[i1].x = x;   fbuf[i1].y = y;
  fbuf[i1].z0 = z0; fbuf[i1].z1 = z1;
  i1 = (i1+1) & (FILLBUFSIZ-1);

  while (i0 != i1) {
    const a = fbuf[i0];
    i0 = (i0+1) & (FILLBUFSIZ-1);

    // check neighbors in ±X, ±Y
    for (let nb=3; nb>=0; nb--) {
      let nx = a.x, ny = a.y;
      if ( (nb & 1) !== 0 ) {
        nx = a.x + ((nb & 2) - 1);
        if (nx < 0 || nx >= xsiz) continue;
      } else {
        ny = a.y + ((nb & 2) - 1);
        if (ny < 0 || ny >= ysiz) continue;
      }
      const nxy = (nx*ysiz + ny)*BUFZSIZ;

      // if bit is set => use dntil0 => find next 0-run
      // else => use uptil1 => find next 1-run
      // replicate Slab6 logic
      const testPos = nxy + a.z0;
      const testBit = 1 << (testPos & 31);
      if ((vbit[testPos>>>5] & testBit) !== 0) {
        // z0 => dntil0
        let newz0 = dntil0(nxy, a.z0, zsiz);
        let newz1 = newz0;
        while (newz1 < a.z1) {
          newz1 = dntil1(nxy, newz1, zsiz);
          fbuf[i1].x = nx; fbuf[i1].y = ny;
          fbuf[i1].z0 = newz0; fbuf[i1].z1 = newz1;
          i1 = (i1+1) & (FILLBUFSIZ-1);

          setzrange1(nxy, newz0, newz1);

          newz0 = dntil0(nxy, newz1, zsiz);
          newz1 = newz0;
        }
      } else {
        let newz0 = uptil1(nxy, a.z0);
        let newz1 = a.z0;
        while (newz1 < a.z1) {
          newz1 = dntil1(nxy, newz1, zsiz);
          fbuf[i1].x = nx; fbuf[i1].y = ny;
          fbuf[i1].z0 = newz0; fbuf[i1].z1 = newz1;
          i1 = (i1+1) & (FILLBUFSIZ-1);

          setzrange1(nxy, newz0, newz1);

          newz0 = uptil1(nxy, newz1);
          newz1 = newz0;
        }
      }
    }
  }
}

/* --------------- GETVIS --------------- */

function getvis(x: number, y: number, z: number,
                xsiz: number, ysiz: number, zsiz: number): number
{
  let i = (x*ysiz + y)*BUFZSIZ + z;
  let j = 1 << (i & 31);
  let block = i >>> 5;

  let vis = 0;

  // -X face
  if (x === 0) {
    vis |= 1;
  } else {
    let ni = i - (ysiz*BUFZSIZ);
    let nb = ni >>> 5;
    let nbj= 1 << (ni & 31);
    if ((vbit[nb] & nbj) !== 0) vis |= 1;
  }
  // +X face
  if (x === xsiz-1) {
    vis |= 2;
  } else {
    let ni = i + (ysiz*BUFZSIZ);
    let nb = ni >>> 5;
    let nbj= 1 << (ni & 31);
    if ((vbit[nb] & nbj) !== 0) vis |= 2;
  }
  // -Y face
  if (y === 0) {
    vis |= 4;
  } else {
    let ni = i - BUFZSIZ;
    let nb = ni >>> 5;
    let nbj= 1 << (ni & 31);
    if ((vbit[nb] & nbj) !== 0) vis |= 4;
  }
  // +Y face
  if (y === ysiz-1) {
    vis |= 8;
  } else {
    let ni = i + BUFZSIZ;
    let nb = ni >>> 5;
    let nbj= 1 << (ni & 31);
    if ((vbit[nb] & nbj) !== 0) vis |= 8;
  }
  // -Z face
  if (z === 0) {
    vis |= 16;
  } else {
    let ni = i - 1;
    let nb = ni >>> 5;
    let nbShift = (ni & 31);
    let nbj= 1 << nbShift;
    if ((vbit[nb] & nbj) !== 0) vis |= 16;
  }
  // +Z face
  if (z === zsiz-1) {
    vis |= 32;
  } else {
    let ni = i + 1;
    let nb = ni >>> 5;
    let nbShift = (ni & 31);
    let nbj= 1 << nbShift;
    if ((vbit[nb] & nbj) !== 0) vis |= 32;
  }
  return vis;
}

/* --------------- PALETTE LOGIC --------------- */

function checkpalimito64(dapal: Uint8Array): void {
  let i:number;
  for (i = 767; i >= 0; i--) {
    if ( (dapal[i] & 0xc0) !== 0 ) break;
  }
  if (i >= 0) {
    // shift entire palette right by 2
    for (let j=0; j<768; j++) {
      dapal[j] = dapal[j] >>> 2;
    }
  }
}

// Slab6 method for building a fast color-lookup. We’ll replicate it.
function initclosestcolorfast(dapal: Uint8Array): void {
  // reset closestcol => 255
  closestcol.fill(255);

  // BFS approach
  const closcan = new Uint32Array(262144);
  let clospos = 0, closend = 0;

  // seed with real palette entries
  for (let j=0; j<255; j++) {
    let r = dapal[j*3+0], g = dapal[j*3+1], b = dapal[j*3+2];
    // i = (r<<12) + (g<<6) + b => range is up to ~ (63<<12 + 63<<6 + 63)
    let i = (r << 12) + (g << 6) + b;
    if (closestcol[i] === 255) {
      closestcol[i] = j;
      closcan[closend++] = i;
    }
  }

  // BFS
  while (clospos < closend) {
    let i = closcan[clospos++];
    let j = closestcol[i];
    // neighbors in 6 directions
    // ±4096 => ±(1<<12), ±64 => ±(1<<6), ±1
    if ((i & 0x3f000) !== 0) {
      let ni = i - 4096;
      if (closestcol[ni] === 255) { closestcol[ni] = j; closcan[closend++] = ni; }
    }
    if ((i & 0x3f000) < 0x3f000) {
      let ni = i + 4096;
      if (closestcol[ni] === 255) { closestcol[ni] = j; closcan[closend++] = ni; }
    }
    if ((i & 0xfc0) !== 0) {
      let ni = i - 64;
      if (closestcol[ni] === 255) { closestcol[ni] = j; closcan[closend++] = ni; }
    }
    if ((i & 0xfc0) !== 0xfc0) {
      let ni = i + 64;
      if (closestcol[ni] === 255) { closestcol[ni] = j; closcan[closend++] = ni; }
    }
    if ((i & 0x3f) !== 0) {
      let ni = i - 1;
      if (closestcol[ni] === 255) { closestcol[ni] = j; closcan[closend++] = ni; }
    }
    if ((i & 0x3f) !== 0x3f) {
      let ni = i + 1;
      if (closestcol[ni] === 255) { closestcol[ni] = j; closcan[closend++] = ni; }
    }
  }
}

/* --------------- THE MAIN LOADER FUNCTION --------------- */

export async function loadKvxSlab6Full(buffer: ArrayBuffer) {
  // Clear global arrays for a fresh load:
  vbit.fill(0);
  voxdata = [];
  xlen.fill(0);
  for (let xi=0; xi<MAXXSIZ; xi++) ylen[xi].fill(0);

  let dv = new DataView(buffer);
  let ptr = 0;
  function readUint32() { let val = dv.getUint32(ptr, true); ptr+=4; return val; }
  function readInt32() { let val = dv.getInt32(ptr, true); ptr+=4; return val; }
  function readByte()  { let val = dv.getUint8(ptr); ptr++; return val; }
  function skip(n:number){ ptr+=n; }

  // 1) Read header
  let numbytes = readUint32(); // (unused)
  let xsiz = readUint32();
  let ysiz = readUint32();
  let zsiz = readUint32();
  if (xsiz>MAXXSIZ || ysiz>MAXYSIZ || zsiz>LIMZSIZ) {
    throw new Error("KVX too big for Slab6-limits");
  }

  let xpiv = readInt32() / 256.0;
  let ypiv = readInt32() / 256.0;
  let zpiv = readInt32() / 256.0;

  // 2) Read xstart
  let xstart = new Uint32Array(xsiz+1);
  for (let i=0; i<xsiz+1; i++){
    xstart[i] = readUint32();
  }

  // 3) Read xyoffs
  let xyoffs: Uint16Array[] = [];
  for (let x=0; x<xsiz; x++){
    let row = new Uint16Array(ysiz+1);
    for (let y=0; y<=ysiz; y++){
      row[y] = dv.getUint16(ptr, true);
      ptr += 2;
    }
    xyoffs[x] = row;
  }

  let fidatpos = ptr;

  // 4) Read palette from last 768 bytes
  {
    let palPos = buffer.byteLength - 768;
    let palBytes = new Uint8Array(buffer, palPos, 768);
    fipalette.set(palBytes);
  }
  // check pal
  checkpalimito64(fipalette);
  initclosestcolorfast(fipalette);

  // ============= PASS 1: Mark surface slabs with setzrange1 ==================
  ptr = fidatpos;
  for (let x=0; x<xsiz; x++) {
    for (let y=0; y<ysiz; y++) {
      let count = xyoffs[x][y+1] - xyoffs[x][y];
      if (!count) continue;
      let xy = (x*ysiz + y)*BUFZSIZ;
      while (count>0) {
        let z1 = readByte();   // header[0]
        let k  = readByte();   // header[1]
        let vis= readByte();   // header[2], we skip
        count -= (k + 3);
        let z2 = z1 + k;
        // skip color bytes
        skip(k);

        // setzrange1
        setzrange1(xy, z1, z2);
      }
    }
  }

  // Flood fill from edges => mark outside
  for (let x=0; x<xsiz; x++){
    for (let z=0; z<zsiz; z++){
      floodfill3dbits(x, 0, z, xsiz, ysiz, zsiz);
      floodfill3dbits(x, ysiz-1, z, xsiz, ysiz, zsiz);
    }
  }
  for (let y=0; y<ysiz; y++){
    for (let z=0; z<zsiz; z++){
      floodfill3dbits(0, y, z, xsiz, ysiz, zsiz);
      floodfill3dbits(xsiz-1, y, z, xsiz, ysiz, zsiz);
    }
  }
  for (let x=0; x<xsiz; x++){
    for (let y=0; y<ysiz; y++){
      floodfill3dbits(x, y, 0, xsiz, ysiz, zsiz);
      floodfill3dbits(x, y, zsiz-1, xsiz, ysiz, zsiz);
    }
  }

  // ============= PASS 2: Clear slabs with setzrange0 ==================
  ptr = fidatpos;
  for (let x=0; x<xsiz; x++) {
    for (let y=0; y<ysiz; y++) {
      let count = xyoffs[x][y+1] - xyoffs[x][y];
      if (!count) continue;
      let xy = (x*ysiz + y)*BUFZSIZ;
      while (count>0) {
        let z1 = readByte();
        let k  = readByte();
        let vis= readByte();
        count -= (k + 3);
        let z2 = z1 + k;
        skip(k);

        setzrange0(xy, z1, z2);
      }
    }
  }

  // ============= PASS 3: Actually read color bytes, store in voxdata[] ==================
  voxdata = [];
  let numvoxs = 0;
  ptr = fidatpos;
  for (let x=0; x<xsiz; x++){
    xlen[x] = 0;
    for (let y=0; y<ysiz; y++){
      ylen[x][y] = 0;
      let count = xyoffs[x][y+1] - xyoffs[x][y];
      if (!count) continue;
      let xy = (x*ysiz + y)*BUFZSIZ;

      while (count>0) {
        let z1 = readByte();
        let k  = readByte();
        let visByte = readByte();  // not used here
        count -= (k + 3);
        let z2 = z1 + k;
        for (let z=z1; z<z2; z++){
          let col = readByte();
          let vis = getvis(x,y,z, xsiz, ysiz, zsiz);
          voxdata.push({ x, y, z, col, vis });
          ylen[x][y]++;
          numvoxs++;
        }
      }
      xlen[x] += ylen[x][y];
    }
  }

  // We are done. Return metadata + a color getter
  return {
    xsiz, ysiz, zsiz,
    xpiv, ypiv, zpiv,
    palette: fipalette.slice(), // copy if you want
    voxdata,
    getColor: (cIndex: number) => {
      // Slab6 uses the possibly shifted palette
      let r = fipalette[cIndex*3+0] * 4;
      let g = fipalette[cIndex*3+1] * 4;
      let b = fipalette[cIndex*3+2] * 4;
      return `rgb(${r},${g},${b})`;
    }
  };
}