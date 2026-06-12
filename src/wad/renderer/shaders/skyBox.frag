#version 300 es
precision mediump float;

uniform sampler2D tex;
uniform float yaw;
uniform float pitch;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = vec4(1.0, 0.0, 1.0, 1.0); // CHROMAKEY
  gl_FragDepth = 1.0;
}
