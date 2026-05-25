#version 300 es
precision mediump float;

in vec3 vColor;

uniform float lightIntensity;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float visibilityDistance;
uniform vec3 dynamicLight;

out vec4 fragColor;

void main() {
  float fogDepth = gl_FragCoord.z / gl_FragCoord.w;
  float sectorDistanceLight = clamp(1.0 - fogDepth / visibilityDistance, 0.16, 1.0);
  float fogFactor = clamp((fogDepth - 420.0) / mix(1400.0, 520.0, fogDensity), 0.0, 1.0);
  vec3 lit = vColor * (max(lightIntensity, 0.32) + dynamicLight) * sectorDistanceLight;
  fragColor = vec4(mix(lit, fogColor, fogFactor), 1.0);
}
