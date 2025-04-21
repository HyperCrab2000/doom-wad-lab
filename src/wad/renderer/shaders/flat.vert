#version 300 es
precision mediump float;

in vec3 aPosition;
in vec3 aNormal;

uniform mat4 modelViewProj;

out vec3 vNormal;
out vec2 vUv;

void main() {
  vUv = aPosition.xz;           // Worldspace position used for UVs
  vNormal = normalize(aNormal); // Pass through real normals
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
