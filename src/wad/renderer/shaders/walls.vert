#version 300 es
precision mediump float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec3 aNormal;

uniform mat4 modelViewProj;

out vec2 vUv;
out vec3 vWorldNormal;

void main() {
  vUv = aUv;
  vWorldNormal = aNormal;
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
