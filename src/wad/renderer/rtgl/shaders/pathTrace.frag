#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform mat4 u_invViewProj;
uniform sampler2D u_triangles;
uniform sampler2D u_triColors;
uniform sampler2D u_sectorLight;
uniform sampler2D u_atlas;
uniform sampler2D u_pointLights;
uniform vec3 u_packOrigin;
uniform vec3 u_packScale;
uniform vec3 u_cameraPos;
uniform vec2 u_traceSize;
uniform int u_triangleCount;
uniform int u_triangleTexWidth;
uniform int u_atlasCols;
uniform int u_atlasRows;
uniform int u_surfaceMask;
uniform int u_useTextures;
uniform int u_dynamicLights;
uniform int u_coloredLights;
uniform int u_pointLightCount;
uniform sampler2D u_sky;
uniform float u_skyYaw;
uniform float u_skyPitch;
uniform float u_hasSky;

const int TRI_SLOTS = 9;
const int MAX_POINT_LIGHTS = 32;
const int MAX_TRACE_TRIANGLES = 16384;
const int INVALID_ATLAS_INDEX = 65535;

vec4 fetchTriTexel(int triIndex, int slot) {
  int texel = triIndex * TRI_SLOTS + slot;
  int x = texel % u_triangleTexWidth;
  int y = texel / u_triangleTexWidth;
  return texelFetch(u_triangles, ivec2(x, y), 0);
}

float texelByte(float channel) {
  return channel > 1.0 ? channel : channel * 255.0;
}

float decodeU16(vec2 loHi) {
  return (texelByte(loHi.x) + texelByte(loHi.y) * 256.0) / 65535.0;
}

vec3 decodeVertex(int triIndex, int vertexSlot) {
  vec4 xy = fetchTriTexel(triIndex, vertexSlot * 2);
  vec4 zm = fetchTriTexel(triIndex, vertexSlot * 2 + 1);
  return vec3(decodeU16(xy.xy), decodeU16(xy.zw), decodeU16(zm.xy)) * u_packScale + u_packOrigin;
}

bool intersectTriangle(vec3 ro, vec3 rd, vec3 v0, vec3 v1, vec3 v2, out float t, out vec3 bary) {
  vec3 e1 = v1 - v0;
  vec3 e2 = v2 - v0;
  vec3 p = cross(rd, e2);
  float det = dot(e1, p);
  if (abs(det) < 1e-6) return false;
  float invDet = 1.0 / det;
  vec3 tv = ro - v0;
  float u = dot(tv, p) * invDet;
  if (u < 0.0 || u > 1.0) return false;
  vec3 q = cross(tv, e1);
  float v = dot(rd, q) * invDet;
  if (v < 0.0 || u + v > 1.0) return false;
  t = dot(e2, q) * invDet;
  if (t <= 0.001) return false;
  bary = vec3(1.0 - u - v, u, v);
  return true;
}

float decodeUv16(vec2 loHi) {
  return (texelByte(loHi.x) + texelByte(loHi.y) * 256.0) / 64.0;
}

vec2 decodeUvPair(vec4 texel) {
  return vec2(decodeUv16(texel.xy), decodeUv16(texel.zw));
}

bool isAtlasPlaceholder(vec3 rgb) {
  return dot(rgb, rgb) < 0.002 ||
    (abs(rgb.r - 0.227) < 0.03 && abs(rgb.g - 0.227) < 0.03 && abs(rgb.b - 0.227) < 0.03);
}

vec4 sampleAtlasNearestRGBA(int atlasIndex, vec2 localUv) {
  int maxCells = max(u_atlasCols * u_atlasRows, 1);
  if (atlasIndex < 0 || atlasIndex >= maxCells) {
    return vec4(0.0, 0.0, 0.0, 0.0);
  }
  ivec2 atlasSize = textureSize(u_atlas, 0);
  ivec2 cellSize = max(ivec2(1), atlasSize / ivec2(max(u_atlasCols, 1), max(u_atlasRows, 1)));
  int col = atlasIndex % max(u_atlasCols, 1);
  int row = atlasIndex / max(u_atlasCols, 1);
  ivec2 origin = ivec2(col, row) * cellSize;
  vec2 uv = fract(localUv);
  ivec2 texel = origin + ivec2(
    min(cellSize.x - 1, int(floor(uv.x * float(cellSize.x)))),
    min(cellSize.y - 1, int(floor(uv.y * float(cellSize.y))))
  );
  return texelFetch(u_atlas, texel, 0);
}

vec4 sampleAtlasLinearRGBA(int atlasIndex, vec2 localUv) {
  int maxCells = max(u_atlasCols * u_atlasRows, 1);
  if (atlasIndex < 0 || atlasIndex >= maxCells) {
    return vec4(0.0, 0.0, 0.0, 0.0);
  }
  vec2 atlasSize = vec2(textureSize(u_atlas, 0));
  vec2 cellSize = atlasSize / vec2(float(max(u_atlasCols, 1)), float(max(u_atlasRows, 1)));
  int col = atlasIndex % max(u_atlasCols, 1);
  int row = atlasIndex / max(u_atlasCols, 1);
  vec2 origin = vec2(float(col), float(row)) * cellSize;
  vec2 atlasUv = (origin + fract(localUv) * cellSize) / atlasSize;
  return texture(u_atlas, atlasUv);
}

vec3 pickAlbedo(vec3 palette, int atlasIndex, vec4 atlasSample) {
  if (u_useTextures < 1) {
    return palette;
  }
  int maxCells = max(u_atlasCols * u_atlasRows, 1);
  if (atlasIndex < 0 || atlasIndex >= maxCells || atlasIndex == INVALID_ATLAS_INDEX) {
    return palette;
  }
  if (dot(atlasSample.rgb, atlasSample.rgb) < 0.0004) {
    return palette;
  }
  return atlasSample.rgb;
}

vec3 sampleAtlasNearest(int atlasIndex, vec2 localUv) {
  return sampleAtlasNearestRGBA(atlasIndex, localUv).rgb;
}

vec3 radialLight(vec3 pos, vec3 color, float radius, float intensity, vec3 worldPos) {
  float dist = distance(pos, worldPos);
  if (dist >= radius) return vec3(0.0);
  float t = clamp(1.0 - dist / max(radius, 1.0), 0.0, 1.0);
  float falloff = t * t * (3.0 - 2.0 * t);
  return color * intensity * falloff * 2.25;
}

vec3 sampleSkyColor(vec3 rd) {
  if (u_hasSky < 0.5) {
    return vec3(0.45, 0.62, 0.88);
  }
  float u = fract(atan(-rd.z, rd.x) / (2.0 * 3.14159265) + u_skyYaw / (2.0 * 3.14159265));
  float pitch = asin(clamp(rd.y, -1.0, 1.0));
  float horizonShift = clamp(u_skyPitch * 0.32, -0.28, 0.28);
  float v = clamp(0.5 + pitch / 3.14159265 + horizonShift, 0.0, 1.0);
  return texture(u_sky, vec2(u, v)).rgb;
}

vec3 accumulatePointLights(vec3 hitPos) {
  if (u_dynamicLights < 1) {
    return vec3(0.0);
  }
  vec3 sum = vec3(0.0);
  for (int i = 0; i < MAX_POINT_LIGHTS; i++) {
    if (i >= u_pointLightCount) break;
    vec4 posRadius = texelFetch(u_pointLights, ivec2(i, 0), 0);
    vec4 colorIntensity = texelFetch(u_pointLights, ivec2(i, 1), 0);
    sum += radialLight(posRadius.xyz, colorIntensity.rgb, posRadius.w, colorIntensity.w, hitPos);
  }
  return sum;
}

int surfaceKindForTri(int triIndex) {
  return int(texelByte(fetchTriTexel(triIndex, 3).b) + 0.5);
}

bool alphaClipForTri(int triIndex) {
  return texelByte(fetchTriTexel(triIndex, 3).a) > 0.5;
}

int atlasIndexForTri(int triIndex) {
  vec4 atlasMeta = fetchTriTexel(triIndex, 5);
  return int(decodeU16(atlasMeta.ba) * 65535.0 + 0.5);
}

vec2 hitUvForTri(int triIndex, vec3 bary) {
  vec2 uv0 = decodeUvPair(fetchTriTexel(triIndex, 6));
  vec2 uv1 = decodeUvPair(fetchTriTexel(triIndex, 7));
  vec2 uv2 = decodeUvPair(fetchTriTexel(triIndex, 8));
  return uv0 * bary.x + uv1 * bary.y + uv2 * bary.z;
}

float doomMod64(float v) {
  return v - floor(v / 64.0) * 64.0;
}

bool isFlatKind(int surfaceKind) {
  return surfaceKind == 1 || surfaceKind == 3;
}

bool passesSurfaceMask(int surfaceKind) {
  if (surfaceKind == 0) return (u_surfaceMask & 1) != 0;
  if (surfaceKind == 1) return (u_surfaceMask & 2) != 0;
  if (surfaceKind == 3) return (u_surfaceMask & 4) != 0;
  return true;
}

vec2 localUvForHit(int triIndex, vec3 bary, int surfaceKind, vec3 hitPos) {
  vec2 hitUv = hitUvForTri(triIndex, bary);
  if (isFlatKind(surfaceKind)) {
    // Match flat.vert: world X/Z in 64-unit doom flat space (not map Y from mesh UVs).
    return fract(vec2(hitPos.x, hitPos.z) / 64.0);
  }
  if (surfaceKind == 2) return clamp(hitUv, 0.0, 1.0);
  // Wall UVs are already normalized to texture repeats (can exceed 1.0).
  return fract(hitUv);
}

bool isFrontFacing(vec3 v0, vec3 v1, vec3 v2, vec3 rd, int surfaceKind) {
  // Floats/sprites are viewed from both sides in DOOM; skip backface cull for ray hits.
  if (surfaceKind != 0) return true;
  vec3 fn = cross(v1 - v0, v2 - v0);
  return dot(fn, rd) <= 0.0;
}

vec3 shadeSurface(
  vec3 albedo,
  float sectorLight,
  vec3 ambientColor,
  vec3 fogColor,
  float visibilityDistance,
  float fogDensity,
  vec3 normal,
  vec3 faceNormal,
  vec3 hitPos,
  int surfaceKind
) {
  vec3 lightDir = normalize(vec3(0.3, 1.0, 0.4));
  float directional = max(dot(normal, lightDir), 0.0);
  float sideShade = surfaceKind == 2 ? 1.0 : 0.72 + 0.28 * abs(dot(normal, faceNormal));
  float baseLight = sectorLight * pow(0.42 + 0.58 * directional, 1.15) * sideShade;

  vec3 dynamicLight = accumulatePointLights(hitPos);
  float dynamicLevel = max(max(dynamicLight.r, dynamicLight.g), dynamicLight.b);

  float fogDepth = length(hitPos - u_cameraPos);
  float sectorDistanceLight = clamp(1.0 - fogDepth / max(visibilityDistance, 1.0), 0.08, 1.0);
  float fogFactor = clamp((fogDepth - 420.0) / mix(1400.0, 520.0, fogDensity), 0.0, 1.0);

  vec3 litColor = albedo * (0.25 + baseLight * 0.75) * sectorDistanceLight;
  litColor += dynamicLight * 0.55 + albedo * dynamicLevel * 0.22;
  if (u_coloredLights > 0) {
    litColor *= mix(vec3(1.0), ambientColor, 0.35);
  }
  vec3 finalColor = mix(litColor, fogColor, fogFactor);
  return pow(finalColor, vec3(1.0 / 2.2));
}

void main() {
  vec2 ndc = vec2(
    (gl_FragCoord.x + 0.5) / u_traceSize.x * 2.0 - 1.0,
    (gl_FragCoord.y + 0.5) / u_traceSize.y * 2.0 - 1.0
  );
  vec4 pNear = u_invViewProj * vec4(ndc, -1.0, 1.0);
  vec4 pFar = u_invViewProj * vec4(ndc, 1.0, 1.0);
  pNear.xyz /= pNear.w;
  pFar.xyz /= pFar.w;
  vec3 ro = pNear.xyz;
  vec3 rd = normalize(pFar.xyz - ro);

  float bestT = 1e30;
  int bestTri = -1;
  vec3 bestBary = vec3(0.0);

  for (int i = 0; i < MAX_TRACE_TRIANGLES; i++) {
    if (i >= u_triangleCount) break;
    int sk = int(texelByte(fetchTriTexel(i, 3).b) + 0.5);
    if (!passesSurfaceMask(sk)) continue;
    vec3 v0 = decodeVertex(i, 0);
    vec3 v1 = decodeVertex(i, 1);
    vec3 v2 = decodeVertex(i, 2);
    float t;
    vec3 bary;
    if (!intersectTriangle(ro, rd, v0, v1, v2, t, bary)) continue;
    if (!isFrontFacing(v0, v1, v2, rd, sk)) continue;
    if (t > bestT + 0.002) continue;
    if (bestTri >= 0 && abs(t - bestT) <= 0.002 && i <= bestTri) continue;
    bestT = t;
    bestTri = i;
    bestBary = bary;
  }

  if (bestTri < 0) {
    fragColor = vec4(sampleSkyColor(rd), 1.0);
    return;
  }

  vec3 v0 = decodeVertex(bestTri, 0);
  vec3 v1 = decodeVertex(bestTri, 1);
  vec3 v2 = decodeVertex(bestTri, 2);
  vec3 faceNormal = normalize(cross(v1 - v0, v2 - v0));
  vec3 normal = dot(faceNormal, rd) > 0.0 ? -faceNormal : faceNormal;
  vec3 hitPos = v0 * bestBary.x + v1 * bestBary.y + v2 * bestBary.z;

  int sectorIndex = int(texelByte(fetchTriTexel(bestTri, 1).b) + 0.5);
  int surfaceKind = surfaceKindForTri(bestTri);
  int atlasIndex = atlasIndexForTri(bestTri);
  float light = max(texelFetch(u_sectorLight, ivec2(clamp(sectorIndex, 0, 255), 0), 0).r, 0.08);
  vec3 ambientColor = max(texelFetch(u_sectorLight, ivec2(clamp(sectorIndex, 0, 255), 1), 0).rgb, vec3(0.35));
  vec3 fogColor = texelFetch(u_sectorLight, ivec2(clamp(sectorIndex, 0, 255), 2), 0).rgb;
  vec4 fogParams = texelFetch(u_sectorLight, ivec2(clamp(sectorIndex, 0, 255), 3), 0);
  float visibilityDistance = max(400.0, texelByte(fogParams.r) + texelByte(fogParams.g) * 256.0);
  float fogDensity = texelByte(fogParams.b) / 255.0;

  vec2 localUv = localUvForHit(bestTri, bestBary, surfaceKind, hitPos);

  vec3 palette = texelFetch(
    u_triColors,
    ivec2(bestTri % u_triangleTexWidth, bestTri / u_triangleTexWidth),
    0
  ).rgb;
  vec4 atlasSample = sampleAtlasLinearRGBA(atlasIndex, localUv);
  vec3 albedo = pickAlbedo(palette, atlasIndex, atlasSample);

  if (surfaceKind == 2) {
    fragColor = vec4(
      shadeSurface(
        albedo,
        light,
        ambientColor,
        fogColor,
        visibilityDistance,
        fogDensity,
        normal,
        faceNormal,
        hitPos,
        surfaceKind
      ),
      1.0
    );
    return;
  }

  if (surfaceKind == 0 && alphaClipForTri(bestTri) && (atlasSample.a < 0.1 || dot(atlasSample.rgb, atlasSample.rgb) < 0.002)) {
    fragColor = vec4(sampleSkyColor(rd), 1.0);
    return;
  }

  fragColor = vec4(
    shadeSurface(
      albedo,
      light,
      ambientColor,
      fogColor,
      visibilityDistance,
      fogDensity,
      normal,
      faceNormal,
      hitPos,
      surfaceKind
    ),
    1.0
  );
}
