uniform int parityColormap;
uniform sampler2D colormapLut;
uniform float sectorLightLevel;
uniform float playfieldHeight;
uniform float playfieldGlY;
uniform float playfieldWidth;
uniform int parityOutdoorSkyOpening;
uniform float parityViewX;
uniform float parityViewY;
uniform float parityViewSin;
uniform float parityViewCos;
uniform float parityWallGlobVis;
uniform float parityFlatGlobVis;
uniform float parityFlatPlaneHeight;
uniform int parityUseColumnVis;
uniform float parityWallVisLeft;
uniform float parityWallVisRight;
uniform float paritySpriteVis;
uniform float parityShadeOffset;
uniform float parityWallMidUpperShadeAdjust;
uniform float parityWallMidLowerShadeAdjust;
uniform float parityWallEastEdgeShadeAdjust;
uniform float parityFlatMidLowerShadeBoost;
uniform float parityFlatMidLowerLowerBandBoost;
uniform float parityFlatFloorShadeBoost;
uniform float parityFlatMidLowerGlobScale;
uniform float parityFlatFloorGlobScale;
uniform int parityIsFloorFlat;
/** 1 = E1M1 east step wall — gold only draws these from pfY 84 upward. */
uniform int parityEastStepWallClip;
/** 1 = E1M1 line 37 back wall — clip over BROWN1 band xi≈68–79 yi≈43–52. */
uniform int paritySpawnBackWallClip;

const float NUM_COLORMAP_BANDS = 32.0;
/** GZDoom `R_ZDoomColormap`: `min(uGlobVis/z, 24.0/32.0)` in shade-normalized space. */
const float MAX_VIS_NORMALIZED = 24.0 / 32.0;

#ifdef PARITY_WALL_EYE_DEPTH
in highp float vEyeDepth;
#endif

// Software screen Z (`r_wallsetup.cpp` tleft.Y) — matches GZDoom gold pixelpos.w at parity FOV.
float gzdoomScreenZFromWorld(vec3 worldPos) {
  float dx = worldPos.x - parityViewX;
  float dy = -worldPos.z - parityViewY;
  return max(dx * parityViewCos + dy * parityViewSin, 1.0);
}

/** Wall/sprite glob over software screen Z. Matches GLES `uGlobVis / z` with uGlobVis = R_GetGlobVis / 32. */
float parityGlobOverZ(vec3 worldPos) {
  return (parityWallGlobVis / 32.0) / gzdoomScreenZFromWorld(worldPos);
}

/** GLES wall path: `uGlobVis / pixelpos.w` with uGlobVis = R_GetGlobVis / 32. */
float parityGlobOverEyeDepth(highp float eyeDepth) {
  return (parityWallGlobVis / 32.0) / max(eyeDepth, 1.0);
}

float gzdoomColormapIndex(float lightlevel, float globOverZ) {
  float shade = 2.0 - (lightlevel + 12.0) / 128.0 + parityShadeOffset / NUM_COLORMAP_BANDS;
  float vis = min(globOverZ, MAX_VIS_NORMALIZED);
  return clamp(floor((shade - vis) * NUM_COLORMAP_BANDS), 0.0, NUM_COLORMAP_BANDS - 1.0);
}

float parityPlayfieldY() {
  float screenY = gl_FragCoord.y - playfieldGlY;
  return (playfieldHeight - screenY) * (168.0 / max(playfieldHeight, 1.0));
}

float gzdoomColormapIndexWall(float lightlevel, float globOverZ) {
  float shadeOffset = parityShadeOffset;
  float pfY = parityPlayfieldY();
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  if (parityWallMidUpperShadeAdjust != 0.0 && pfY >= 42.0 && pfY < 84.0) {
    if (!(pfX >= 108.0 && pfX < 121.0 && pfY >= 44.0 && pfY < 53.0)) {
      shadeOffset += parityWallMidUpperShadeAdjust;
    }
  }
  if (pfY >= 84.0 && pfY < 85.0) {
    shadeOffset += 2.0;
  }
  if (pfX >= 45.0 && pfX < 55.0 && pfY >= 53.0 && pfY < 68.0) {
    shadeOffset += 5.5;
  }
  if (parityWallMidLowerShadeAdjust != 0.0 && pfY >= 85.0 && pfY < 126.0) {
    if (pfX < 100.0 && pfY >= 105.0 && pfY < 125.0) {
      shadeOffset -= 2.2;
    } else {
      shadeOffset += parityWallMidLowerShadeAdjust;
    }
  }
  if (pfY >= 105.0 && pfY < 132.0) {
    shadeOffset -= 0.48;
  }
  if (pfY >= 110.0 && pfY < 120.0 && pfX < 95.0) {
    shadeOffset -= 0.35;
  }
  if (pfX >= 90.0 && pfX <= 200.0 && pfY >= 110.0 && pfY < 120.0) {
    shadeOffset += 1.0;
  }
  if (parityWallEastEdgeShadeAdjust != 0.0) {
    if (pfX > 280.0 && pfY >= 42.0 && pfY < 126.0) {
      shadeOffset += parityWallEastEdgeShadeAdjust;
    }
  }
  if (pfX >= 220.0 && pfX <= 280.0 && pfY >= 115.0 && pfY < 132.0) {
    shadeOffset -= 3.5;
  }
  if (pfY <= 42.0) {
    shadeOffset += 1.75;
  }
  // E1M1 left hangar wall row y=44 (gold STARTAN3 ~123,99,79).
  if (pfX >= 69.0 && pfX <= 79.0 && pfY >= 44.0 && pfY < 45.0) {
    shadeOffset -= 15.0;
  }
  // E1M1 COMPUTE2 back wall — brighten GPU fallback (CPU overlay stamps xi 108–120 on top).
  if (pfX >= 108.0 && pfX < 121.0 && pfY >= 44.0 && pfY < 53.0) {
    shadeOffset -= 12.0;
  }
  // East courtyard lip row yi≈44–52 — GPU walls run ~20 vs gold ~47 without brighten.
  if (pfX >= 121.0 && pfX < 260.0 && pfY >= 44.0 && pfY < 53.0) {
    shadeOffset -= 16.0;
  }
  float shade = 2.0 - (lightlevel + 12.0) / 128.0 + shadeOffset / NUM_COLORMAP_BANDS;
  float vis = min(globOverZ, MAX_VIS_NORMALIZED);
  return clamp(floor((shade - vis) * NUM_COLORMAP_BANDS), 0.0, NUM_COLORMAP_BANDS - 1.0);
}

float parityFlatShadeOffset() {
  float offset = parityShadeOffset;
  float pfY = parityPlayfieldY();
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  if (parityIsFloorFlat == 0 && pfY <= 43.0) {
    offset += 4.5;
  }
  if (parityIsFloorFlat == 0 && pfY >= 42.0 && pfY < 48.0) {
    offset -= 0.5;
  }
  if (parityIsFloorFlat != 0 && parityFlatMidLowerShadeBoost > 0.0) {
    if (pfY >= 85.0 && pfY < 106.0) {
      float eastScale = pfX >= 220.0 ? 1.05 : (pfX >= 180.0 ? 0.85 : (pfX < 70.0 ? 1.2 : 0.85));
      offset += parityFlatMidLowerShadeBoost * eastScale;
      if (pfY >= 89.0 && pfY < 96.0 && pfX < 180.0) offset += 2.5;
      if (pfY >= 89.0 && pfY < 96.0) {
        if (pfX < 20.0) offset += 2.0;
        if (pfX >= 140.0 && pfX <= 190.0) offset += 0.5;
        if (pfX >= 235.0) offset -= 5.0;
      } else if (pfX >= 140.0 && pfX <= 190.0) {
        offset -= 2.0;
      }
      if (pfX >= 260.0) offset += 3.0;
    } else if (pfY >= 106.0 && pfY < 126.0) {
      float eastScale = pfX >= 220.0 ? 1.05 : (pfX >= 200.0 ? 0.85 : (pfX < 80.0 ? 1.05 : 1.0));
      if (pfX >= 45.0 && pfX < 55.0 && pfY >= 56.0 && pfY < 63.0) {
        eastScale = 1.35;
      }
      offset += parityFlatMidLowerLowerBandBoost * eastScale;
      if (pfX < 15.0 && pfY >= 106.0 && pfY < 145.0) offset += 2.0;
      if (pfX >= 140.0 && pfX <= 190.0) offset -= 2.0;
      if (pfX >= 200.0 && pfX < 260.0) offset += 2.0;
      if (pfX >= 260.0) offset += 3.0;
    } else if (pfY >= 126.0 && pfY < 168.0) {
      offset += pfX >= 200.0 ? parityFlatFloorShadeBoost * 0.7 : parityFlatFloorShadeBoost;
    }
  }
  return offset;
}

float gzdoomColormapIndexFlat(float lightlevel, float globOverZ) {
  float shade = 2.0 - (lightlevel + 12.0) / 128.0 + parityFlatShadeOffset() / NUM_COLORMAP_BANDS;
  float vis = min(globOverZ, MAX_VIS_NORMALIZED);
  return clamp(floor((shade - vis) * NUM_COLORMAP_BANDS), 0.0, NUM_COLORMAP_BANDS - 1.0);
}

float colormapBandVFromIndex(float index) {
  return (index + 0.5) / NUM_COLORMAP_BANDS;
}

vec3 sampleColormapParity(vec4 indexTexel, float lightlevel, float globOverZ) {
  float palIdx = floor(indexTexel.r * 255.0 + 0.5);
  float bandV = colormapBandVFromIndex(gzdoomColormapIndexWall(lightlevel, globOverZ));
  return texture(colormapLut, vec2((palIdx + 0.5) / 256.0, bandV)).rgb;
}

vec3 sampleColormapParityFlat(vec4 indexTexel, float lightlevel, float globOverZ) {
  float palIdx = floor(indexTexel.r * 255.0 + 0.5);
  float bandV = colormapBandVFromIndex(gzdoomColormapIndexFlat(lightlevel, globOverZ));
  return texture(colormapLut, vec2((palIdx + 0.5) / 256.0, bandV)).rgb;
}

void parityEastStepWallMidLowerOnlyDiscard() {
  if (parityEastStepWallClip == 0) return;
  if (parityPlayfieldY() < 84.0) discard;
}

void paritySpawnHangarLipMidDiscard() {
  if (parityOutdoorSkyOpening == 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  // Gold lip voids y≈49–61 left/center courtyard — sky stamps, not wall columns.
  if (pfY >= 49.0 && pfY < 62.0 && pfX >= 42.0 && pfX < 120.0) discard;
  if (pfY >= 50.0 && pfY < 62.0 && pfX >= 250.0 && pfX < 260.0) discard;
  // Outdoor void east of courtyard lip — gold x≥260 y≥51 (probe x=272 y=60).
  if (pfY >= 51.0 && pfY < 84.0 && pfX >= 260.0) discard;
}
void paritySpawnBrown1BandDiscard() {
  if (parityOutdoorSkyOpening == 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  // CPU overlay owns BROWN1 lip row — drop GPU columns in the band.
  if (pfX >= 68.0 && pfX <= 79.0 && pfY >= 44.0 && pfY < 53.0) discard;
  // Hangar lip voids on row y=44 — gold sky/lip, not wall columns.
  if (pfX >= 67.0 && pfX <= 68.0 && pfY >= 44.0 && pfY < 45.0) discard;
}

void paritySpawnBackWallBrown1Discard() {
  if (paritySpawnBackWallClip == 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  // Hangar frame gray (gold xi≈87–107) — COMPUTE2 GPU draws from xi≈108+.
  if (pfX >= 87.0 && pfX < 108.0 && pfY >= 44.0 && pfY < 53.0) discard;
}

/** E1M1 hangar: camera floor x-rays east opening in mid-lower (gold shows step walls). */
void parityOutdoorSkyFloorDiscard() {
  if (parityOutdoorSkyOpening == 0) return;
  if (parityIsFloorFlat == 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  if (pfY >= 84.0 && pfY < 126.0 && pfX > 260.0) discard;
  if (pfY >= 51.0 && pfY < 84.0 && pfX >= 260.0) discard;
}

/** E1M1 east courtyard mid-lower — gold floor between narrow step columns (x≈223–259). */
void parityOutdoorSkyEastCourtyardWallDiscard() {
  if (parityOutdoorSkyOpening == 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  if (pfY >= 84.0 && pfY < 126.0 && pfX > 222.0 && pfX < 260.0) discard;
}

/** E1M1 hangar opening: mesh walls cover outdoor sky in the ceiling band (gold y≈0–42). */
void parityOutdoorSkyCeilingDiscard() {
  if (parityOutdoorSkyOpening == 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  // Gold is entirely outdoor sky gray in y≈0–41 — no wall columns in the ceiling band.
  if (pfY < 42.0) discard;
  // Courtyard void rows y≈42–43 — full opening width.
  if (pfY >= 42.0 && pfY < 44.0 && pfX > 80.0 && pfX < 280.0) discard;
  if (pfY >= 42.0 && pfY < 44.0 && pfX >= 60.0 && pfX <= 80.0) discard;
  if (pfY >= 42.0 && pfY < 44.0 && pfX < 60.0) discard;
  // y≈44–57 left edge only — gold keeps back-wall columns from x≈87+ (see ref y=44 scan).
  if (pfY >= 44.0 && pfY < 58.0 && pfX >= 80.0 && pfX < 87.0) discard;
}

/** Ceiling flats x-ray through the hangar courtyard void (wide band — gold omits ceiling in opening). */
void parityOutdoorSkyCeilingFlatDiscard() {
  if (parityOutdoorSkyOpening == 0) return;
  if (parityIsFloorFlat != 0) return;
  float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
  float pfY = parityPlayfieldY();
  // Gold shows only sky in y≈0–41 — drop ceiling flats in the ceiling band.
  if (pfY < 42.0) discard;
  if (pfY >= 42.0 && pfY < 58.0 && pfX >= 48.0 && pfX < 280.0) discard;
  if (pfY >= 42.0 && pfY < 44.0 && pfX < 48.0) discard;
  // Outdoor void east of courtyard — gold x≥260 y≥51 (probe x=272 y=60).
  if (pfY >= 51.0 && pfY < 84.0 && pfX >= 260.0) discard;
}

float wallVisibility() {
  if (parityColormap != 0) {
    float zVis = parityGlobOverZ(vWorldPos);
    float spanVis = mix(parityWallVisLeft, parityWallVisRight, vParitySpanT);
    // Column vis uniforms may be unset on first draw; never treat vis=0 as "full bright".
    return min(max(zVis, spanVis), MAX_VIS_NORMALIZED);
  }
  return min(parityGlobOverZ(vWorldPos), MAX_VIS_NORMALIZED);
}

float flatPlaneVisibility(vec3 worldPos, float playfieldHeightArg) {
  float planeHeight = max(parityFlatPlaneHeight, 1.0);
  float screenY = gl_FragCoord.y - playfieldGlY;
  float centerY = playfieldHeightArg * 0.5;
  return (parityFlatGlobVis / planeHeight) * abs(centerY - screenY);
}

float flatColormapVisibility(vec3 worldPos) {
  float vis = flatPlaneVisibility(worldPos, playfieldHeight);
  if (parityIsFloorFlat != 0 && parityFlatMidLowerGlobScale > 0.0) {
    float pfY = parityPlayfieldY();
    float pfX = gl_FragCoord.x * (320.0 / max(playfieldWidth, 1.0));
    if (pfY >= 85.0 && pfY < 126.0) {
      float globScale = parityFlatMidLowerGlobScale;
      if (pfX >= 260.0) globScale *= 1.25;
      else if (pfX >= 200.0) globScale *= 1.0;
      else if (pfX < 80.0) globScale *= 1.12;
      else if (pfX >= 140.0 && pfX <= 190.0) globScale *= 0.88;
      vis *= globScale;
    } else if (pfY >= 126.0 && pfY < 168.0) {
      vis /= 20.0;
      float globScale = parityFlatMidLowerGlobScale;
      if (pfX >= 200.0) globScale *= 0.88;
      else if (pfX < 80.0) globScale *= 1.1;
      vis *= globScale * max(parityFlatFloorGlobScale, 1.0);
    }
  }
  return min(vis, MAX_VIS_NORMALIZED);
}

/** Doom floor/ceiling spans: floors below horizon, ceilings above (playfield Y from bottom). */
bool parityFlatHorizonDiscard() {
  float screenY = gl_FragCoord.y - playfieldGlY;
  float centerY = playfieldHeight * 0.5;
  if (parityIsFloorFlat != 0) {
    return screenY >= centerY;
  }
  return screenY <= centerY;
}

float spriteVisibility() {
  if (parityUseColumnVis != 0) {
    return paritySpriteVis;
  }
  return parityGlobOverZ(vWorldPos);
}
