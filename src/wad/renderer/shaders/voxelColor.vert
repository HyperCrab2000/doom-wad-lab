#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;

uniform mat4 modelViewProj;

out vec3 vColor;

void main() {
  vColor = aColor;
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
