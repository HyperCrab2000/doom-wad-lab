vec3 GetSpecMap(sampler2D specularTex, vec2 uv) {
    return texture(specularTex, uv).rgb;
}
