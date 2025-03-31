vec2 ParallaxMap(mat3 tbn, sampler2D heightMap, vec2 uv, vec3 cameraPos, vec3 pixelPos) {
    const float parallaxScale = 0.4;
    const float minLayers = 12.0;
    const float maxLayers = 16.0;

    mat3 invTBN = transpose(tbn);
    vec3 V = normalize(invTBN * (cameraPos - pixelPos));

    float numLayers = mix(maxLayers, minLayers, clamp(abs(V.z), 0.0, 1.0));
    float layerDepth = 1.0 / numLayers;
    float currentLayerDepth = 0.0;

    vec2 P = V.xy * parallaxScale;
    vec2 deltaTexCoords = P / numLayers;
    vec2 currentTexCoords = uv + (P * 0.07);
    float currentDepthMapValue = 0.5 - texture(heightMap, currentTexCoords).r;

    while (currentLayerDepth < currentDepthMapValue) {
        currentTexCoords -= deltaTexCoords;
        currentDepthMapValue = 0.5 - texture(heightMap, currentTexCoords).r;
        currentLayerDepth += layerDepth;
    }
    return currentTexCoords - (P * 0.01);
}
