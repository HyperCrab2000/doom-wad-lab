#version 300 es
precision mediump float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 modelViewProj;

out vec2 vUv;
out vec3 vNormal;

void main() {
  vUv = aPosition.xz;        // for 64x64 tile wrapping
  vNormal = aNormal;         // world space normal
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
