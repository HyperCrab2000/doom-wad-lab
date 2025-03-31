#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

out vec3 vNormal;
out vec3 vWorldPos;
out vec2 vTexCoord;

uniform mat4 modelViewProj;
uniform mat4 model;
uniform mat4 normalMatrix;

void main() {
    vec4 worldPos = model * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = mat3(normalMatrix) * aNormal;
    vTexCoord = aTexCoord;
    gl_Position = modelViewProj * vec4(aPosition, 1.0);
}
