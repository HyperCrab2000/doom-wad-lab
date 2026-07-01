#version 300 es
precision mediump float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUv;

uniform mat4 modelViewProj;
uniform bool shouldMirror;

out vec3 vPos;
out vec2 vUv;
out float vParitySpanT;

void main(void) {
  vPos = aPosition;

  vec2 outUv = aUv;
  if (shouldMirror) {
    outUv.x = 1.0 - outUv.x;
  }
  vUv = outUv;
  vParitySpanT = outUv.x;

  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
