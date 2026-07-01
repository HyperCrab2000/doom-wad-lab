uniform int parityColormap;
uniform sampler2D colormapLut;
uniform float sectorLightLevel;
uniform float playfieldHeight;
uniform int parityUseColumnVis;
uniform float parityWallVisLeft;
uniform float parityWallVisRight;
uniform float paritySpriteVis;
uniform float parityShadeOffset;

const float NUM_COLORMAP_BANDS = 32.0;
const float MAX_LIGHT_VIS = 24.0;
const float WALL_GLOB_VIS = 8.0;

float gzdoomShade(float lightlevel) {
  return NUM_COLORMAP_BANDS * 2.0 - (lightlevel + 12.0) * (NUM_COLORMAP_BANDS / 128.0);
}

float gzdoomColormapIndex(float lightlevel, float visibility) {
  float shade = gzdoomShade(lightlevel) + parityShadeOffset;
  float vis = min(MAX_LIGHT_VIS, visibility);
  return clamp(floor(shade - vis), 0.0, NUM_COLORMAP_BANDS - 1.0);
}

float colormapBandVFromIndex(float index) {
  return (index + 0.5) / NUM_COLORMAP_BANDS;
}

vec3 sampleColormapParity(vec4 indexTexel, float lightlevel, float visibility) {
  float palIdx = floor(indexTexel.r * 255.0 + 0.5);
  float bandV = colormapBandVFromIndex(gzdoomColormapIndex(lightlevel, visibility));
  return texture(colormapLut, vec2((palIdx + 0.5) / 256.0, bandV)).rgb;
}

float wallVisibility() {
  if (parityUseColumnVis != 0) {
    return mix(parityWallVisLeft, parityWallVisRight, vParitySpanT);
  }
  float screenZ = max(gl_FragCoord.z / gl_FragCoord.w, 1.0);
  return WALL_GLOB_VIS / screenZ;
}

float flatPlaneVisibility(vec3 worldPos, vec3 cameraPos, float playfieldHeight) {
  float planeHeight = max(abs(worldPos.y - cameraPos.y), 1.0);
  float centerY = playfieldHeight * 0.5;
  float screenY = gl_FragCoord.y;
  return (WALL_GLOB_VIS / planeHeight) * abs(centerY - screenY);
}

float spriteVisibility() {
  if (parityUseColumnVis != 0) {
    return paritySpriteVis;
  }
  float screenZ = max(gl_FragCoord.z / gl_FragCoord.w, 1.0);
  return WALL_GLOB_VIS / screenZ;
}
