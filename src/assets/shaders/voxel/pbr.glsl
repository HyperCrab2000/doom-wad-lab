void ApplyPBR(inout Material mat, vec2 uv) {
    mat.Metallic = texture(metallictexture, uv).r;
    mat.Roughness = texture(roughnesstexture, uv).r;
    mat.AO = texture(aotexture, uv).r;
}
