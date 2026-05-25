// VoxelDoom CheelloVoxelShader.fp parallax occlusion mapping (POM).

mat3 GetTBN(vec3 n, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p);
  vec3 dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);

  vec3 dp2perp = cross(n, dp2);
  vec3 dp1perp = cross(dp1, n);
  vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;

  float invmax = inversesqrt(max(dot(t, t), dot(b, b)));
  return mat3(t * invmax, b * invmax, n);
}

float GetHeightTexAt(sampler2D heightMap, vec2 currentTexCoords) {
  return 0.5 - texture(heightMap, currentTexCoords).r;
}

vec2 ParallaxOcclusionMap(
  sampler2D heightMap,
  mat3 tbn,
  vec2 texCoord,
  vec3 cameraPos,
  vec3 worldPos,
  float reliefStrength
) {
  if (reliefStrength < 0.01) {
    return texCoord;
  }

  float dist = distance(cameraPos, worldPos);
  if (dist > 1024.0) {
    return texCoord;
  }

  const float parallaxScale = 0.36;
  const float minLayers = 12.0;
  const float maxLayers = 16.0;

  mat3 invTBN = transpose(tbn);
  vec3 V = normalize(invTBN * (cameraPos - worldPos));

  float numLayers = mix(maxLayers, minLayers, clamp(abs(V.z), 0.0, 1.0));
  float layerDepth = 1.0 / numLayers;
  float currentLayerDepth = 0.0;

  vec2 P = V.xy * parallaxScale * reliefStrength;
  vec2 deltaTexCoords = P / numLayers;
  vec2 currentTexCoords = texCoord + (P * 0.07);
  float currentDepthMapValue = GetHeightTexAt(heightMap, currentTexCoords);

  while (currentLayerDepth < currentDepthMapValue) {
    currentTexCoords -= deltaTexCoords;
    currentDepthMapValue = GetHeightTexAt(heightMap, currentTexCoords);
    currentLayerDepth += layerDepth;
  }

  deltaTexCoords *= 0.5;
  layerDepth *= 0.5;
  currentTexCoords += deltaTexCoords;
  currentLayerDepth -= layerDepth;

  for (int step = 0; step < 14; step++) {
    float currentHeight = GetHeightTexAt(heightMap, currentTexCoords);
    deltaTexCoords *= 0.5;
    layerDepth *= 0.5;

    if (currentHeight > currentLayerDepth) {
      currentTexCoords -= deltaTexCoords;
      currentLayerDepth += layerDepth;
    } else {
      currentTexCoords += deltaTexCoords;
      currentLayerDepth -= layerDepth;
    }
  }

  return currentTexCoords - (P * 0.01);
}
