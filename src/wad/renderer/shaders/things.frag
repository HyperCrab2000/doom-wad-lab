#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float lightIntensity;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float visibilityDistance;
uniform vec3 nearbyLight;
uniform vec3 emissiveColor;
uniform float emissiveTopExtent;
uniform float emissiveFullColumn;
uniform float emissiveStrength;
uniform float centerClipZ;
uniform float centerClipW;

in vec3 vPos;
in vec2 vUv;

out vec4 fragColor;

void main(void) {
  vec4 col = texture(tex, vUv);

  if (col.a < 0.1) {
    discard;
  }

  float flameMask = emissiveFullColumn > 0.5
    ? mix(1.0, 0.28, vUv.y)
    : smoothstep(emissiveTopExtent + 0.05, emissiveTopExtent - 0.02, vUv.y);
  vec3 selfGlow = emissiveColor * flameMask * emissiveStrength * 0.62;

  float fakeDepthLighting = clamp(gl_FragCoord.w * 500.0, 0.0, 1.0);
  float fogDepth = gl_FragCoord.z / gl_FragCoord.w;
  float sectorDistanceLight = clamp(1.0 - fogDepth / visibilityDistance, 0.08, 1.0);
  float fogFactor = clamp((fogDepth - 420.0) / mix(1400.0, 520.0, fogDensity), 0.0, 1.0);
  float nearbyLevel = max(max(nearbyLight.r, nearbyLight.g), nearbyLight.b);
  vec3 lit = col.xyz * (max(lightIntensity, 0.18) + nearbyLevel * 0.22) + selfGlow;
  lit *= fakeDepthLighting * sectorDistanceLight;

  gl_FragDepth = centerClipZ / centerClipW * 0.5 + 0.5;
  fragColor = vec4(mix(lit, fogColor, fogFactor), col.a);
}
