attribute vec3 aPosition;
attribute vec2 aUv;  // <-- must exist

varying vec2 vUv;

uniform mat4 modelViewProj;

void main() {
  gl_Position = modelViewProj * vec4(aPosition, 1.0);
  vUv = aUv;
}