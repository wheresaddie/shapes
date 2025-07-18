uniform float blurRadius;
uniform float normalSensitivity;

vec3 octDecode(vec2 f) {
    vec3 n = vec3(f * 2.0 - 1.0, 0.0);
    n.z = 1.0 - abs(n.x) - abs(n.y);

    vec2 offset = clamp(-n.z, 0.0, 1.0) * sign(n.xy);
    n.xy += (n.z < 0.0) ? (offset * -1.0) : vec2(0.0);

    return normalize(n);
}

void unpackFromHalfFloat(float packedFloat, out vec2 octN, out float roughness) {
  uint packed16 = uint(round(packedFloat * 65535.0));

  uint nx = packed16 & 31u;
  uint ny = (packed16 >> 5) & 31u;
  uint r = (packed16 >> 10) & 63u;

  octN.x = float(nx) / 31.0;
  octN.y = float(ny) / 31.0;
  roughness = float(r) / 63.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

    // Unpack roughness and normal from alpha channel of center pixel
    vec2 centerOctN;
    float roughness;
    unpackFromHalfFloat(inputColor.a, centerOctN, roughness);
    vec3 centerNormal = octDecode(centerOctN);

    if (roughness < 1.0/256.0) {
      outputColor = vec4(inputColor.rgb, 1.0);
      return;
    }
    
    float effectiveRadius = max(1.0, blurRadius * roughness);
    
    vec3 blurredColor = inputColor.rgb;
    float totalWeight = 1.0; // center pixel included
    
    for (float x = -effectiveRadius; x <= effectiveRadius; x += 2.0) {
      for (float y = -effectiveRadius; y <= effectiveRadius; y += 2.0) {
        if (x == 0.0 && y == 0.0) continue;
        
        vec2 offset = vec2(x, y) / resolution;
        vec2 samplePos = uv + offset;
        
        vec4 samplePixel = texture2D(inputBuffer, samplePos);
        
        // Unpack neighbor normal and roughness from alpha
        vec2 sampleOctN;
        float sampleRoughness;
        unpackFromHalfFloat(samplePixel.a, sampleOctN, sampleRoughness);
        vec3 sampleNormal = octDecode(sampleOctN);
        
        // Spatial weight (Gaussian)
        float dist = length(vec2(x, y));
        float spatialWeight = exp(-dist * dist / (2.0 * effectiveRadius * effectiveRadius));
        
        // Normal difference weight (bilateral)
        // Use dot product to measure similarity between normals
        float normalDot = dot(centerNormal, sampleNormal);
        // Clamp in case of numeric errors
        normalDot = clamp(normalDot, -1.0, 1.0);
        
        // Convert similarity to difference metric, scaled by sensitivity
        // normal difference = angle between normals
        float normalDiff = acos(normalDot);
        
        // Weight based on normal difference (smaller angle → higher weight)

        float edgeThreshold = radians(20.0);
        if (normalDiff > edgeThreshold) continue;
        if (abs(roughness - sampleRoughness) > 0.1) continue;

        float normalWeight = exp(-normalDiff * normalDiff / (2.0 * normalSensitivity * normalSensitivity));
        
        // Roughness similarity weight
        float roughnessSimilarity = 1.0 - abs(roughness - sampleRoughness);
        
        // Combine weights
        float weight = spatialWeight * normalWeight * roughnessSimilarity;
        
        blurredColor += samplePixel.rgb * weight;
        totalWeight += weight;
      }
    }
    
    blurredColor /= max(totalWeight, 0.001);
    
    outputColor = vec4(blurredColor, 1.0);
}
 