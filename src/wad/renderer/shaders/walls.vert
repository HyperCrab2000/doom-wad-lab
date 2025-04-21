#version 300 es
precision mediump float;

in vec3 aPosition;
in vec2 aUv;

uniform mat4 modelViewProj;

out vec2 vUv;
out vec3 vWorldNormal;

void main() {
  vUv = aUv;

  // Wall faces out in Z direction (typical DOOM wall orientation)
  vWorldNormal = normalize(vec3(0.0, 0.0, 1.0));

  gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
