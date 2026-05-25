uniform mat4 modelViewProj;
uniform bool shouldMirror;

attribute vec3 aPosition;
attribute vec2 aUv;

varying vec3 vPos;
varying vec2 vUv;

void main(void) {
  vPos = aPosition;
  
  vec2 outUv = aUv;

  if (shouldMirror) {
    outUv.x = 1.0 - outUv.x;
  }

  vUv = outUv;

  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
