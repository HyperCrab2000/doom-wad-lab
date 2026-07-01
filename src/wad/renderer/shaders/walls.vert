#version 300 es
precision mediump float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec3 aNormal;

uniform mat4 modelViewProj;

// ponytail: WebGL2 GLSL ES has no noperspective; linear varyings are fine for wall UVs.
out vec2 vUv;
out float vParitySpanT;
out vec3 vWorldNormal;
out vec3 vWorldPos;

void main() {
  vUv = aUv;
  vParitySpanT = aUv.x;
  vWorldNormal = aNormal;
  vWorldPos = aPosition;
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
