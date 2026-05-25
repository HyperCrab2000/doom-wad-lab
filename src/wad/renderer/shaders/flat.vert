#version 300 es
precision mediump float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 modelViewProj;
uniform float timeSeconds;
uniform float liquidStrength;

out vec2 vUv;
out vec3 vNormal;
out float vWorldY;  // <-- just grouped with the rest
out vec3 vWorldPos;

void main() {
  vUv = aPosition.xz;
  vNormal = aNormal;
  vec3 position = aPosition;
  if (liquidStrength > 0.0) {
    float coarseX = floor(position.x / 16.0);
    float coarseZ = floor(position.z / 16.0);
    float wave =
      sin(coarseX * 0.7 + timeSeconds * 2.2) +
      sin(coarseZ * 0.55 + timeSeconds * 1.7);
    position.y += wave * liquidStrength * 1.2;
  }
  vWorldY = position.y;  // ✅ this is the vertical height used in the glow
  vWorldPos = position;
  gl_Position = modelViewProj * vec4(position, 1.0);
}
