#version 300 es
precision highp float;
precision highp sampler2D;

in vec3 vNormal;
in vec3 vWorldPos;
in vec2 vTexCoord;

out vec4 fragColor;

// Uniforms
uniform vec3 uCameraPos;
uniform float lightIntensity;
uniform int uFogEnabled;

// Sampler2D inputs
uniform sampler2D baseTexture;
uniform sampler2D normaltexture;
uniform sampler2D speculartexture;
uniform sampler2D metallictexture;
uniform sampler2D roughnesstexture;
uniform sampler2D aotexture;
uniform sampler2D brighttexture;
uniform sampler2D heightTex;
uniform sampler2D fParallaxEnabled;

// Struct
struct Material {
    vec3 Normal;
    vec3 Base;
    vec3 Specular;
    vec4 Bright;
    float Glossiness;
    float SpecularLevel;
    float Metallic;
    float Roughness;
    float AO;
};

// --- UTILITY FUNCTIONS ---

mat3 GetTBN(vec3 normal, vec3 position, vec2 uv) {
    vec3 n = normalize(normal);
    vec3 dp1 = dFdx(position);
    vec3 dp2 = dFdy(position);
    vec2 duv1 = dFdx(uv);
    vec2 duv2 = dFdy(uv);

    vec3 dp2perp = cross(n, dp2);
    vec3 dp1perp = cross(dp1, n);
    vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
    vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;

    float invmax = inversesqrt(max(dot(t, t), dot(b, b)));
    return mat3(t * invmax, b * invmax, n);
}

vec3 ApplyNormalMap(mat3 tbn, sampler2D normalMap, vec2 uv) {
    #if defined(NORMALMAP)
    vec3 map = texture(normalMap, uv).xyz;
    map = map * 255.0 / 127.0 - 128.0 / 127.0;
    map.xy *= vec2(0.5, -0.5);
    return normalize(tbn * map);
    #else
    return normalize(vNormal);
    #endif
}

vec3 GetSpecMap(sampler2D specTex, vec2 uv) {
    #if defined(SPECULAR)
    return texture(specTex, uv).rgb;
    #else
    return vec3(0.0);
    #endif
}

void ApplyPBR(inout Material mat, vec2 uv) {
    #if defined(PBR)
    mat.Metallic = texture(metallictexture, uv).r;
    mat.Roughness = texture(roughnesstexture, uv).r;
    mat.AO = texture(aotexture, uv).r;
    #endif
}

float GetHeightTexAt(vec2 uv) {
    return 0.5 - texture(heightTex, uv).r;
}

vec2 ParallaxMap(mat3 tbn, vec2 uv, vec3 pixelPos) {
    float parallaxEnabled = texture(fParallaxEnabled, uv).r;

    if (length(pixelPos) > 1024.0 || parallaxEnabled < 1.0) return uv;

    #if defined(heightTex)
    const float parallaxScale = 0.4;
    const float minLayers = 12.0;
    const float maxLayers = 16.0;

    mat3 invTBN = transpose(tbn);
    vec3 V = normalize(invTBN * (uCameraPos - pixelPos));

    float numLayers = mix(maxLayers, minLayers, clamp(abs(V.z), 0.0, 1.0));
    float layerDepth = 1.0 / numLayers;
    float currentLayerDepth = 0.0;

    vec2 P = V.xy * parallaxScale;
    vec2 deltaTexCoords = P / numLayers;
    vec2 currentTexCoords = uv + (P * 0.07);
    float currentDepthMapValue = GetHeightTexAt(currentTexCoords);

    while (currentLayerDepth < currentDepthMapValue) {
        currentTexCoords -= deltaTexCoords;
        currentDepthMapValue = GetHeightTexAt(currentTexCoords);
        currentLayerDepth += layerDepth;
    }

    deltaTexCoords *= 0.5;
    layerDepth *= 0.5;

    // Optional: relief mapping refinement
    const int reliefSteps = 14;
    int currentStep = reliefSteps;
    while (currentStep > 0) {
        float height = GetHeightTexAt(currentTexCoords);
        deltaTexCoords *= 0.5;
        layerDepth *= 0.5;

        if (height > currentLayerDepth) {
            currentTexCoords -= deltaTexCoords;
            currentLayerDepth += layerDepth;
        } else {
            currentTexCoords += deltaTexCoords;
            currentLayerDepth -= layerDepth;
        }
        currentStep--;
    }

    return currentTexCoords - (P * 0.01);
    #else
    return uv;
    #endif
}

// --- SETUP MATERIAL ---

void SetupMaterial(inout Material mat, vec3 normal, vec3 position, vec2 uv, vec3 pixelPos) {
    vec2 texCoord = vTexCoord;
    mat.Base = texture(baseTexture, texCoord).rgb;

    if (uFogEnabled == -3) {
        texCoord = uv;
        mat.Normal = normalize(normal);
    } else {
        mat3 tbn = GetTBN(normal, position, uv);
        texCoord = ParallaxMap(tbn, uv, pixelPos);
        mat.Normal = ApplyNormalMap(tbn, normaltexture, texCoord);
    }

    mat.Specular = GetSpecMap(speculartexture, texCoord);
    ApplyPBR(mat, texCoord);
    mat.Bright = texture(brighttexture, texCoord);
}

// --- MAIN ---
uniform vec3 uLightDir;

void main() {
    vec3 normal = normalize(vNormal);

    // Basic Lambertian diffuse
    float diffuse = max(dot(normal, uLightDir), 0.0);

    // Add a simple ambient term to soften shadows
    float ambient = 0.2;

    // Optional specular/gloss
    float specular = 0.0;
    #ifdef SPECULAR
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    vec3 halfwayDir = normalize(uLightDir + viewDir);
    specular = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
    #endif

    vec4 texColor = texture(baseTexture, vTexCoord);
    vec3 finalColor = texColor.rgb * (ambient + diffuse) + vec3(specular);
    fragColor = vec4(finalColor * lightIntensity, texColor.a);
}

