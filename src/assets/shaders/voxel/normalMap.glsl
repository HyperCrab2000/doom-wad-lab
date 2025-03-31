vec3 ApplyNormalMap(mat3 tbn, sampler2D normalMap, vec2 uv) {
    vec3 map = texture(normalMap, uv).xyz;
    map = map * 255.0 / 127.0 - 128.0 / 127.0;
    map.xy *= vec2(0.5, -0.5);
    return normalize(tbn * map);
}
