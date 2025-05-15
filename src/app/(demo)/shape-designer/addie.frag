
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec2 iResolution;
uniform vec3 iMouse;
uniform int numberOfShapes;
uniform int numberOfMaterials;
uniform int numberOfLights;
uniform int maxRays;
uniform float giLength;
uniform float giStrength;
uniform float aoStrength;
uniform vec3 camTgt;
uniform float camHeight;
uniform float camDist;
uniform float orbit;

#define AA 1

//------------------------------------------------------------------
float dot2( in vec2 v ) { return dot(v,v); }
float dot2( in vec3 v ) { return dot(v,v); }
float ndot( in vec2 a, in vec2 b ) { return a.x*b.x - a.y*b.y; }

const int MAX_SHAPES = 20;
const int MAX_MATERIALS = 20;
const int MAX_LIGHTS = 5;
const int MAX_RAYS = 40;

//Shapes
const int   PLANE          = 0;
const int   SPHERE         = 1;
const int   BOX            = 2;
const int   ROUND_BOX      = 3;
const int   TORUS          = 4;
const int   LINK           = 5;
const int   CONE           = 6;
const int   HEX_PRISM      = 7;
const int   TRI_PRISM      = 8;
const int   CAPSULE        = 9;
const int   CYLINDER       = 10;
const int   ROUND_CYLINDER = 11;
const int   CUT_CONE       = 12;
const int   SOLID_ANGLE    = 13;
const int   CUT_SPHERE     = 14;
const int   ROUND_CONE     = 15;
const int   ELLIPSOID      = 16;
const int   FOOTBALL       = 17;
const int   OCTAHEDRON     = 18;
const int   PYRAMID        = 19;

// Lights
const int   OMNI           = 0;
const int   DIRECTIONAL    = 1;
const int   POINT          = 2;
const int   SKY            = 3;

const float FUDGE_FACTOR   = 0.9;

const float PI             = 3.14159265359;

bool override = false;
vec4 overrideColor = vec4(1.,0.,0.,1.);

struct Material {
  bool emissive, intRef;
  vec3 color, innerColor, glowColor;
  float kd, ior, reflectivity, roughness, reflectRoughness, refractRoughness, metallic, transparency, attenuation, attenuationStrength, glow;
};

struct Shape {
  int type, id;
  vec2 l, c;
  vec3 a, b, n, pos;
  float h, r, r1, r2;
  int mat;
  mat3 rot;
  bool isRot;
};

struct Light {
  int type;
  float strength;
  vec3 color;
  bool ranged;
  float r;
  vec3 dir;
  vec3 pos;
};

uniform Shape shapes[MAX_SHAPES];
uniform Material materials[MAX_MATERIALS];
uniform Light lights[MAX_LIGHTS];

float sdSphere( vec3 p, float r )
{
  return length(p)-r;
}

float sdBox( vec3 p, vec3 a )
{
  vec3 q = abs(p) - a;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

float sdRoundBox( vec3 p, vec3 a, float r )
{
  vec3 q = abs(p) - a + r;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r;
}

float sdTorus( vec3 p, float r1, float r2)
{
  vec2 q = vec2(length(p.xz)-r1,p.y);
  return length(q)-r2;
}

float sdLink( vec3 p, float h, float r1, float r2 )
{
  vec3 q = vec3( p.x, max(abs(p.y)-h,0.0), p.z );
  return length(vec2(length(q.xy)-r1,q.z)) - r2;
}

float sdCone( vec3 p, vec2 c, float h )
{
  // c is the sin/cos of the angle, h is height
  // Alternatively pass q instead of (c,h),
  // which is the point at the base in 2D
  vec2 q = h*vec2(c.x/c.y,-1.0);
    
  vec2 w = vec2( length(p.xz), p.y );
  vec2 a = w - q*clamp( dot(w,q)/dot(q,q), 0.0, 1.0 );
  vec2 b = w - q*vec2( clamp( w.x/q.x, 0.0, 1.0 ), 1.0 );
  float k = sign( q.y );
  float d = min(dot( a, a ),dot(b, b));
  float s = max( k*(w.x*q.y-w.y*q.x),k*(w.y-q.y)  );
  return sqrt(d)*sign(s);
}

float sdPlane( vec3 p, vec3 n, float h )
{
  // n must be normalized
  return dot(p,n) + h;
}

float sdHexPrism( vec3 p, vec2 l )
{
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;
  vec2 d = vec2(
       length(p.xy-vec2(clamp(p.x,-k.z*l.x,k.z*l.x), l.x))*sign(p.y-l.x),
       p.z-l.y );
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdTriPrism( vec3 p, vec2 l )
{
  vec3 q = abs(p);
  return max(q.z-l.y,max(q.x*0.866025+p.y*0.5,-p.y)-l.x*0.5);
}

float sdCapsule( vec3 p, float h, float r)
{
  p.y -= clamp( p.y, 0.0, h );
  return length( p ) - r;
}

float sdCylinder( vec3 p, float h, float r )
{
  vec2 d = abs(vec2(length(p.xz),p.y)) - vec2(r,h);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdRoundCylinder( vec3 p, float r, float r1, float h )
{
  vec2 d = vec2( length(p.xz)-2.0*r+r1, abs(p.y) - h );
  return min(max(d.x,d.y),0.0) + length(max(d,0.0)) - r1;
}

float sdCutCone( vec3 p, float h, float r1, float r2 )
{
  vec2 q = vec2( length(p.xz), p.y );
  vec2 k1 = vec2(r2,h);
  vec2 k2 = vec2(r2-r1,2.0*h);
  vec2 ca = vec2(q.x-min(q.x,(q.y<0.0)?r1:r2), abs(q.y)-h);
  vec2 cb = q - k1 + k2*clamp( dot(k1-q,k2)/dot2(k2), 0.0, 1.0 );
  float s = (cb.x<0.0 && ca.y<0.0) ? -1.0 : 1.0;
  return s*sqrt( min(dot2(ca),dot2(cb)) );
}

float sdSolidAngle( vec3 p, vec2 c, float r1 )
{
  // c is the sin/cos of the angle
  vec2 q = vec2( length(p.xz), p.y );
  float l = length(q) - r1;
  float m = length(q - c*clamp(dot(q,c),0.0,r1) );
  return max(l,m*sign(c.y*q.x-c.x*q.y));
}

float sdCutSphere( vec3 p, float r, float h )
{
  // sampling independent computations (only depend on shape)
  float w = sqrt(r*r-h*h);

  // sampling dependant computations
  vec2 q = vec2( length(p.xz), p.y );
  float s = max( (h-r)*q.x*q.x+w*w*(h+r-2.0*q.y), h*q.x-w*q.y );
  return (s<0.0) ? length(q)-r :
         (q.x<w) ? h - q.y     :
                   length(q-vec2(w,h));
}

float sdRoundCone( vec3 p, float r1, float r2, float h )
{
  // sampling independent computations (only depend on shape)
  float b = (r1-r2)/h;
  float a = sqrt(1.0-b*b);

  // sampling dependant computations
  vec2 q = vec2( length(p.xz), p.y );
  float k = dot(q,vec2(-b,a));
  if( k<0.0 ) return length(q) - r1;
  if( k>a*h ) return length(q-vec2(0.0,h)) - r2;
  return dot(q, vec2(a,b) ) - r1;
}

float sdEllipsoid( vec3 p, float r, float r1, float r2 )
{
  vec3 r3 = vec3(r, r1, r2);
  float k0 = length(p/r3);
  float k1 = length(p/(r3*r3));
  return k0*(k0-1.0)/k1;
}

float sdFootball( in vec3 p, in vec3 a, in vec3 b, in float h )
{
    vec3  c = (a+b)*0.5;
    float l = length(b-a);
    vec3  v = (b-a)/l;
    float y = dot(p-c,v);
    vec2  q = vec2(length(p-c-y*v),abs(y));
    
    float r = 0.5*l;
    float d = 0.5*(r*r-h*h)/h;
    vec3  h2 = (r*q.x<d*(q.y-r)) ? vec3(0.0,r,0.0) : vec3(-d,0.0,d+h);
 
    return length(q-h2.xy) - h2.z;
}

float sdOctahedron( vec3 p, float r )
{
  p = abs(p);
  float m = p.x+p.y+p.z-r;
  vec3 q;
       if( 3.0*p.x < m ) q = p.xyz;
  else if( 3.0*p.y < m ) q = p.yzx;
  else if( 3.0*p.z < m ) q = p.zxy;
  else return m*0.57735027;
    
  float k = clamp(0.5*(q.z-q.y+r),0.0,r); 
  return length(vec3(q.x,q.y-r+k,q.z-k)); 
}

float sdPyramid( in vec3 p, in float h )
{
    if (p.y <= 0.0)
        return length(max(abs(p)-vec3(0.5,0.0,0.5),0.0));
    float m2 = h*h + 0.25;
    
    // symmetry
    p.xz = abs(p.xz); // do p=abs(p) instead for double pyramid
    p.xz = (p.z>p.x) ? p.zx : p.xz;
    p.xz -= 0.5;
	
    // project into face plane (2D)
    vec3 q = vec3( p.z, h*p.y-0.5*p.x, h*p.x+0.5*p.y);
        
    float s = max(-q.x,0.0);
    float t = clamp( (q.y-0.5*q.x)/(m2+0.25), 0.0, 1.0 );
    
    float a = m2*(q.x+s)*(q.x+s) + q.y*q.y;
	float b = m2*(q.x+0.5*t)*(q.x+0.5*t) + (q.y-m2*t)*(q.y-m2*t);
    
    float d2 = max(-q.y,q.x*m2+q.y*0.5) < 0.0 ? 0.0 : min(a,b);
    
    // recover 3D and scale, and add sign
    return sqrt( (d2+q.z*q.z)/m2 ) * sign(max(q.z,-p.y));;
}


float sdU( in vec3 p, in float r, in float le, vec2 w )
{
    p.x = (p.y>0.0) ? abs(p.x) : length(p.xy);
    p.x = abs(p.x-r);
    p.y = p.y - le;
    float k = max(p.x,p.y);
    vec2 q = vec2( (k<0.0) ? -k : length(max(p.xy,0.0)), abs(p.z) ) - w;
    return length(max(q,0.0)) + min(max(q.x,q.y),0.0);
}

//------------------------------------------------------------------

vec3 opU( vec3 d1, vec3 d2 )
{
	return (d1.x<d2.x) ? d1 : d2;
}

// Simple hash function based on the input value
float random(vec2 seed) {
    // Use a hashing algorithm to create a pseudo-random number
    return fract(sin(dot(seed ,vec2(12.9898,78.233))) * 43758.5453123);
}

mat3 makeTBN(vec3 n) {
    vec3 tangent = normalize(abs(n.y) < 0.999 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 bitangent = cross(n, tangent);
    return mat3(tangent, bitangent, n);
}

vec3 randomSpherePoint(vec3 rand) {
  float ang1 = (rand.x + 1.0) * PI; // [-1..1) -> [0..2*PI)
  float u = rand.y; // [-1..1), cos and acos(2v-1) cancel each other out, so we arrive at [-1..1)
  float u2 = u * u;
  float sqrt1MinusU2 = sqrt(1.0 - u2);
  float x = sqrt1MinusU2 * cos(ang1);
  float y = sqrt1MinusU2 * sin(ang1);
  float z = u;
  return vec3(x, y, z);
}

vec3 randomHemispherePoint(vec3 rand, vec3 dir) {
    vec3 v = randomSpherePoint(rand);
    if (dot(v, vec3(0, 0, 1)) < 0.0) v = -v; // ensure it's in the upper hemisphere
    mat3 tbn = makeTBN(normalize(dir)); // align Z-axis with dir
    return normalize(tbn * v); // rotate to world space
}

//------------------------------------------------------------------

#define ZERO (min(iFrame,0))

//------------------------------------------------------------------

vec3 map( in vec3 pos, int bounce )
{
    vec3 res = vec3( pos.y, 0.0, -1.0 );

    for(int i = 0; i < numberOfShapes + ZERO; i++)
    {
        Shape s = shapes[i];
        vec3 delta = pos - s.pos;
        vec3 rotatedDelta = s.rot * delta;
        vec3 newPos = rotatedDelta;

        if( sdBox( newPos,vec3(0.5,0.5,0.5) ) < res.x )
        {
            switch(s.type)
            {
              case PLANE:
                break;
              case SPHERE:
                res = opU( res, vec3( sdSphere(newPos, s.r) * FUDGE_FACTOR, s.mat, i ) );
                break;
              case BOX:
                res = opU( res, vec3( sdBox(newPos, s.a) * FUDGE_FACTOR, s.mat, i ) );
                break;
              case ROUND_BOX:
                res = opU( res, vec3( sdRoundBox(newPos, s.a, s.r) * FUDGE_FACTOR, s.mat, i) );
                break;
              case TORUS:
                res = opU( res, vec3( sdTorus(newPos, s.r1, s.r2) * FUDGE_FACTOR, s.mat, i) );
                break;
              case LINK:
                res = opU( res, vec3( sdLink(newPos, s.h, s.r1, s.r2) * FUDGE_FACTOR, s.mat, i) );
                break;
              case CONE:
                res = opU( res, vec3( sdCone(newPos, s.c, s.h) * FUDGE_FACTOR, s.mat, i) );
                break;
              case HEX_PRISM:
                res = opU( res, vec3( sdHexPrism(newPos, s.l) * FUDGE_FACTOR, s.mat, i) );
                break;
              case TRI_PRISM:
                res = opU( res, vec3( sdTriPrism(newPos, s.l) * FUDGE_FACTOR, s.mat, i) );
                break;
              case CAPSULE:
                res = opU( res, vec3( sdCapsule(newPos, s.h, s.r) * FUDGE_FACTOR, s.mat, i) );
                break;
              case CYLINDER:
                res = opU( res, vec3( sdCylinder(newPos, s.h, s.r) * FUDGE_FACTOR, s.mat, i) );
                break;
              case ROUND_CYLINDER:
                res = opU( res, vec3( sdRoundCylinder(newPos, s.r1, s.r2, s.h) * FUDGE_FACTOR, s.mat, i) );
                break;
              case CUT_CONE:
                res = opU( res, vec3( sdCutCone(newPos, s.h, s.r1, s.r2) * FUDGE_FACTOR, s.mat, i) );
                break;
              case SOLID_ANGLE:
                res = opU( res, vec3( sdSolidAngle(newPos, s.c, s.r1) * FUDGE_FACTOR, s.mat, i) );
                break;
              case CUT_SPHERE:
                res = opU( res, vec3( sdCutSphere(newPos, s.r, s.h) * FUDGE_FACTOR, s.mat, i) );
                break;
              case ROUND_CONE:
                res = opU( res, vec3( sdRoundCone(newPos, s.h, s.r1, s.r2) * FUDGE_FACTOR, s.mat, i) );
                break;
              case ELLIPSOID:
                res = opU( res, vec3( sdEllipsoid(newPos, s.r, s.r1, s.r2) * FUDGE_FACTOR, s.mat, i) );
                break;
              case FOOTBALL:
                res = opU( res, vec3( sdFootball(newPos, s.a, s.b, s.h) * FUDGE_FACTOR, s.mat, i) );
                break;
              case OCTAHEDRON:
                res = opU( res, vec3( sdOctahedron(newPos, s.r) * FUDGE_FACTOR, s.mat, i) );
                break;
              case PYRAMID:
                res = opU( res, vec3( sdPyramid(newPos, s.r) * FUDGE_FACTOR, s.mat, i) );
                break;
            }
        }
    }

    return res;
}

vec3 map( in vec3 pos )
{
  return map(pos, -999);
}

// https://iquilezles.org/articles/boxfunctions
vec2 iBox( in vec3 ro, in vec3 rd, in vec3 rad ) 
{
    vec3 m = 1.0/rd;
    vec3 n = m*ro;
    vec3 k = abs(m)*rad;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
	  return vec2( max( max( t1.x, t1.y ), t1.z ), min( min( t2.x, t2.y ), t2.z ) );
}

vec3 raycast(in vec3 ro, in vec3 rd, int bounce)
{
    vec3 res = vec3(-1.0, -1.0, -1.0);

    float tmin = 0.01;
    float tmax = 20.0;

    // Raytrace floor plane
    float tp1 = (0.0 - ro.y) / rd.y;
    if (tp1 > 0.0)
    {
        tmax = min(tmax, tp1);
        res = vec3(tp1, 0.0, -1.0);
    }

    // Raymarch bounding box
    vec2 tb = iBox(ro - vec3(0.0, 0.4, 0.0), rd, vec3(2.0, 2.0, 2.0));
    if (tb.x < tb.y && tb.y > 0.0 && tb.x < tmax)
    {
        //tmin = max(tb.x, tmin);
        //tmax = min(tb.y, tmax);

        float t = tmin;
        float prevStep = 1e6;
        int stallCount = 0;
        const int STALL_LIMIT = 10;
        const float epsilon = 0.1;  // Require at least 5% improvement per step
        int bounceCount = 0;
        int count = 0;

        for (int i = 0; i < 150 && t < tmax; i++)
        {
            vec3 p = ro + rd * t;
            vec3 h = map(p, bounce);  // h.x = dist, h.y = material?, h.z = shape index
            float step = abs(h.x);

            // Hit surface
            if (step < (0.0001 * t))
            {
                res = vec3(t, h.y, h.z);
                break;
            }

            // Refined stall detection
            if (step == prevStep)
            {
                stallCount++;
            }
            else
            {
                stallCount = 0;
            }

            prevStep = step;

            if (stallCount >= STALL_LIMIT)
            {
                vec3 jumpDir;
                if (h.y == 0.0)
                {
                    jumpDir = vec3(0.0, 1.0, 0.0);
                }
                else
                {
                    vec3 shapeCenter = shapes[int(h.z)].pos;
                    vec3 toCenter = normalize(p - shapeCenter);
                    jumpDir = (h.x > 0.0) ? toCenter : -toCenter;
                }

                // Nudge forward slightly in rd and laterally out of stall zone
                t += 0.05;
                ro += jumpDir * 0.04;
                stallCount = 0;
                bounceCount++;
            }
            else
            {
                t += step;
            }
            count++;
        }
    }

    return res;
}

vec3 raycast( in vec3 ro, in vec3 rd ) 
{
    return raycast(ro, rd, 0);
}

// https://iquilezles.org/articles/rmshadows
float calcSoftShadow( in vec3 ro, in vec3 rd, in float mint, in float tmax )
{
    // bounding volume
    float tp = (0.8-ro.y)/rd.y; if( tp>0.0 ) tmax = min( tmax, tp );

    float res = 1.0;
    float t = mint;
    for( int i=ZERO; i<24; i++ )
    {
		  float h = map( ro + rd*t ).x;
      float s = clamp(8.0*h/t,0.0,1.0);
      res = min( res, s );
      t += clamp(h, 0.001, 0.05);
      if( res<-1.0 || t>tmax) break;
    }
    res = max(res, -1.0);
    return 0.25 * (1.0+res)*(1.0+res)*(2.0-res);
}

// https://iquilezles.org/articles/normalsSDF
vec3 calcNormal( in vec3 pos )
{
#if 0
    vec2 e = vec2(1.0,-1.0)*0.5773*0.0005;
    return normalize( e.xyy*map( pos + e.xyy ).x + 
					  e.yyx*map( pos + e.yyx ).x + 
					  e.yxy*map( pos + e.yxy ).x + 
					  e.xxx*map( pos + e.xxx ).x );
#else
    // inspired by tdhooper and klems - a way to prevent the compiler from inlining map() 4 times
    vec3 n = vec3(0.0);
    for( int i=ZERO; i<4; i++ )
    {
        vec3 e = 0.5773*(2.0*vec3((((i+3)>>1)&1),((i>>1)&1),(i&1))-1.0);
        n += e*map(pos+0.0005*e).x;
      //if( n.x+n.y+n.z>100.0 ) break;
    }
    return normalize(n);
#endif    
}

// https://iquilezles.org/articles/nvscene2008/rwwtt.pdf
float calcAO( in vec3 pos, in vec3 nor )
{
	float occ = 0.0;
    float sca = 1.0;
    for( int i=ZERO; i<5; i++ )
    {
        float h = 0.01 + 0.12*float(i)/4.0;
        float d = map( pos + h*nor ).x;
        occ += (h-d)*sca;
        sca *= 0.95;
        if( occ>0.35 ) break;
    }
    return clamp( 1.0 - 3.0*occ, 0.0, 1.0 ) * (0.5+0.5*nor.y);
}

vec4 gi(in vec3 pos, in vec3 nor) {
  vec4 col = vec4(0);
  for (int i=0; i<4; i++) {
    float hr = .01 + float(i) * giLength / 4.;
    vec3 res = map( pos + hr*nor );

    Material mat = materials[int(res.y)];
    col += vec4(mat.color, 1.) * (hr - res.x);
  }
  col.rgb *= giStrength / giLength;
  col.w = clamp(1.-col.w * aoStrength / giLength, 0., 1.);
  return col;
}

// https://iquilezles.org/articles/checkerfiltering
float checkersGradBox( in vec2 p, in vec2 dpdx, in vec2 dpdy )
{
    // filter kernel
    vec2 w = abs(dpdx)+abs(dpdy) + 0.001;
    // analytical integral (box filter)
    vec2 i = 2.0*(abs(fract((p-0.5*w)*0.5)-0.5)-abs(fract((p+0.5*w)*0.5)-0.5))/w;
    // xor pattern
    return 0.5 - 0.5*i.x*i.y;                  
}

vec3 lighting(vec3 pos, vec3 rd, vec3 nor, vec3 ref, vec3 albedo, Material mat, int bounce) 
{
    vec3 lin = vec3(0.0); 
    vec3 V = -rd;

    for(int i = 0 + ZERO; i < numberOfLights + ZERO; i++) {
        Light light = lights[i];
        vec3 L, lightCol = light.color;
        float attenuation = 1.0;

        if(light.type == OMNI) {
            lin += lightCol * light.strength * mat.kd * albedo; // Ambient light only affects diffuse
            continue;
        }

        if(light.type == DIRECTIONAL) {
            L = normalize(-light.dir);
        } 
        else if(light.type == POINT) {
            vec3 toLight = light.pos - pos;
            float dist2 = dot(toLight, toLight);
            float dist = sqrt(dist2);
            L = toLight / dist;
            if(light.ranged)
                attenuation *= clamp(1.0 - dist / light.r, 0.0, 1.0);
        }

        // Shadow
        float shadow = calcSoftShadow(pos + nor * 0.01, L, 0.01, 10.0);
        if(shadow < 0.001) continue;

        // Half vector for Cook-Torrance
        vec3 H = normalize(L + V);

        float NdotL = max(dot(nor, L), 0.0);
        float NdotV = max(dot(nor, V), 0.0);
        float NdotH = max(dot(nor, H), 0.0);
        float VdotH = max(dot(V, H), 0.0);

        // Fresnel term (Schlick)
        vec3 F0 = mix(vec3(0.04), albedo, mat.metallic);
        vec3 F = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);

        // Geometry term (Smith GGX Approximation)
        float alpha = mat.roughness * mat.roughness;
        float k = (alpha + 1.0) * (alpha + 1.0) / 8.0;
        float G_V = NdotV / (NdotV * (1.0 - k) + k);
        float G_L = NdotL / (NdotL * (1.0 - k) + k);
        float G = G_V * G_L;

        // Normal distribution function (GGX)
        float a2 = alpha * alpha;
        float d = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
        float D = a2 / (PI * d * d);

        // Cook-Torrance specular BRDF
        vec3 spec = (F * G * D) / max(4.0 * NdotL * NdotV, 0.001);

        // Diffuse (Lambert or none for metals)
        vec3 kd = (1.0 - F) * (1.0 - mat.metallic);
        vec3 diffuse = kd * albedo / PI;

        // Combine
        vec3 contrib = (diffuse + spec) * light.strength * lightCol * NdotL * attenuation * shadow;
        lin += contrib;
    }

    // Global Illumination
    vec4 giCol = gi(pos, nor);
    lin = lin * giCol.w + giCol.rgb;

    return lin;
}


// Ray structure
struct Ray {
    vec3 origin;
    vec3 direction;
    float throughput; // Color multiplier for the ray
    bool inside;
    int identifier;
};

Ray rays[MAX_RAYS]; // Array to store rays
int numRays = 0;     // The number of active rays in the array

// Function to add a new ray to the ray queue
void addRay(vec3 origin, vec3 direction, float throughput, bool inside, int identifier) {
    if (numRays < maxRays) {
        rays[numRays].origin = origin;
        rays[numRays].direction = direction;
        rays[numRays].throughput = throughput; // Color multiplier
        rays[numRays].inside = inside; // inside
        rays[numRays].identifier = identifier; // inside
        numRays++;
    }
}

vec3 render(in vec3 ro, in vec3 rd, in vec3 rdx, in vec3 rdy) {
    // Initialize background color
    vec3 bg = vec3(0.8, 0.8, 0.8);
    vec3 col = vec3(0.);

    // Initialize the first ray
    addRay(ro, rd, 1.0, false, -1);

    // Project pixel footprint into the plane
    vec3 dpdx = ro.y * (rd / rd.y - rdx / rdx.y);
    vec3 dpdy = ro.y * (rd / rd.y - rdy / rdy.y);

    // Process each ray
    for (int i = 0; i < numRays; i++) {

      Ray currentRay = rays[i];

      // Perform raycast to find intersection point
      vec3 res = raycast(currentRay.origin, currentRay.direction, currentRay.identifier); // Use raycast here
      float t = res.x;
      float m = res.y;

      if(m == -1.0 && i == 3)
      {
        //override = true;
      }

      if(!currentRay.inside)
      {
        if (m > -0.5) { // Hit an object
            Material mat = materials[int(m)];
            vec3 pos = currentRay.origin + t * currentRay.direction;
            vec3 nor = (m < 0.5) ? vec3(0.0, 1.0, 0.0) : calcNormal(pos);
            vec3 refDir = reflect(currentRay.direction, nor);
            const int numberOfRefractSamples = 4;
            const int numberOfReflectSamples = 4;

            vec3 base = mat.color; 

            // Lighting calculations for the current point
            vec3 lin = lighting(pos, currentRay.direction, nor, refDir, base, mat, i);

            if(mat.transparency == 0.0 && mat.reflectivity == 0.0)
            {
              col += lin * currentRay.throughput;
            } 
            else if(mat.reflectivity > 0.0 || mat.transparency > 0.0)
            {
              if(mat.reflectivity > 0.0 && mat.transparency == 0.0)
              {
                col += lin * currentRay.throughput * (1.0 - mat.reflectivity);
                if(mat.reflectRoughness > 0.01)
                {
                  for(int j = 0; j < numberOfReflectSamples; j++)
                  {
                    vec3 jitter = mat.reflectRoughness * randomHemispherePoint(vec3(random(vec2(float(j) * 0.73, fract(t * 13.3))), random(vec2(float(j + 1) * 0.91, fract(t * 17.7))), random(vec2(float(j + 2) * 1.32, fract(t * 31.3)))), refDir);
                    addRay(pos + nor * 0.002, normalize(refDir + jitter), currentRay.throughput * mat.reflectivity * (1. / float(numberOfReflectSamples)), false, 0 + i);
                  }
                }
                else
                {
                  addRay(pos + nor * 0.002, refDir, currentRay.throughput * mat.reflectivity, false, 0 + i);
                }
              }
              else 
              {
                // Refractive direction (calculate if we can refract)
                float eta = 1. / mat.ior;
                vec3 refractDir = refract(currentRay.direction, nor, eta);
                bool canRefract = length(refractDir) > 0.0;

                // Fresnel term (Schlick approximation)
                float cosTheta = clamp(dot(-currentRay.direction, nor), 0.0, 1.0);
                float fresnel = mat.reflectivity + (1.0 - mat.reflectivity) * pow(1.0 - cosTheta, 5.0);

                if(canRefract && mat.transparency > 0.0)
                {
                  col += lin * currentRay.throughput * (1.0 - mat.transparency);
                  
                  if(mat.refractRoughness > 0.01)
                  {
                    for(int j = 0; j < numberOfRefractSamples; j++)
                    {
                      vec3 jitter = 0.1 * mat.refractRoughness * randomHemispherePoint(vec3(random(vec2(float(j) * 0.73, fract(t * 13.3))), random(vec2(float(j + 1) * 0.91, fract(t * 17.7))), random(vec2(float(j + 2) * 1.32, fract(t * 31.3)))), refDir);
                      addRay(pos + nor * 0.004, normalize(refractDir - jitter), currentRay.throughput * mat.transparency * (1. / float(numberOfRefractSamples)), true, 10 + i);
                    }
                  }
                  else
                  {
                    addRay(pos + nor * 0.004, refractDir, currentRay.throughput * mat.transparency, true, 10 + i);
                  }
                }
                if(fresnel != 0.0)
                {
                  col += lin * currentRay.throughput * (1.0 - fresnel);
                  if(mat.reflectRoughness > 0.01)
                  {
                    for(int j = 0; j < numberOfReflectSamples; j++)
                    {
                      vec3 jitter = 0.1 * mat.reflectRoughness * randomHemispherePoint(vec3(random(vec2(float(j) * 0.73, fract(t * 13.3))), random(vec2(float(j + 1) * 0.91, fract(t * 17.7))), random(vec2(float(j + 2) * 1.32, fract(t * 31.3)))), refDir);
                      addRay(pos + nor * 0.002, normalize(refDir + jitter), currentRay.throughput * fresnel * 1. / float(numberOfReflectSamples), false, 20 + i);
                    }
                  }
                  else
                  {
                    addRay(pos + nor * 0.002, refDir, currentRay.throughput * fresnel, false, 20 + i);
                  }
                }
              }
            }
        } else {
            // Missed the object, so keep the background color
            col += bg * currentRay.throughput;
        }
      }
      else
      {
        if (m > -0.5)
        {
          Material mat = materials[int(m)];
          vec3 pos = currentRay.origin + t * currentRay.direction;
          vec3 nor = -calcNormal(pos);
          vec3 refDir = reflect(currentRay.direction, nor);

          float eta = mat.ior;
          vec3 refractDir = refract(currentRay.direction, nor, eta);
          bool canRefract = length(refractDir) > 0.0;

          // Fresnel term (Schlick approximation)
          float cosTheta = clamp(dot(-currentRay.direction, nor), 0.0, 1.0);
          float fresnel = mat.reflectivity + (1.0 - mat.reflectivity) * pow(1.0 - cosTheta, 5.0);

          float att = pow((1.0 - pow(mat.attenuation, 20.)), (pow(1.0 + t, mat.attenuationStrength)));
          float throughput = att; 
          if(mat.attenuation > 0.0)
          {
            col += currentRay.throughput * (1.0 - att) * mat.innerColor;
          }

          bool escaped = false;
          if(canRefract && fresnel != 1.0)
          {
            addRay(pos - nor * 0.004, refractDir, currentRay.throughput * throughput, false, 30 + i);
          }
          else if(numRays + 1 == maxRays)
          {
            escaped = true;
            addRay(pos - nor * 0.004, currentRay.direction, currentRay.throughput * throughput, false, 40 + i);
          }

          if(!canRefract && !escaped && mat.intRef)
          { 
            addRay(pos + nor * 0.002, refDir, currentRay.throughput * 0.25, true, 50 + i);
          }
        }
      }
    }

    return clamp(col, 0.0, 1.0);
}

mat3 setCamera( in vec3 ro, in vec3 ta, float cr )
{
	vec3 cw = normalize(ta-ro);
	vec3 cp = vec3(sin(cr), cos(cr),0.0);
	vec3 cu = normalize( cross(cw,cp) );
	vec3 cv =          ( cross(cu,cw) );
    return mat3( cu, cv, cw );
}

vec3 convertColor(float color) {
    return 0.2 + 0.2*sin( color*2.0 + vec3(0.0,1.0,2.0));
}

vec3 hsv2rgb(vec3 hsv) { return ((clamp(abs(fract(hsv.x+vec3(0,2,1)/3.)*2.-1.)*3.-1.,0.,1.)-1.)*hsv.y+1.)*hsv.z; }

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 mo = clamp(iMouse.xy/iResolution.xy, 0.,1.);

    // camera	
    vec3 ro;
    
    if(orbit > 0.01)
    {
      ro = camTgt + vec3( camDist*cos(iTime * orbit), camHeight, camDist*sin(iTime * orbit) );
    }
    else
    {
      ro = camTgt + vec3( camDist*cos(PI*2.*mo.x), (0.1 + camHeight) * mo.y, camDist*sin(PI*2.*mo.x) );
    }
    // camera-to-world transformation
    mat3 ca = setCamera( ro, camTgt, 0.0 );

    vec3 tot = vec3(0.0);
#if AA>1
    for( int m=ZERO; m<AA; m++ )
    for( int n=ZERO; n<AA; n++ )
    {
        // pixel coordinates
        vec2 o = vec2(float(m),float(n)) / float(AA) - 0.5;
        vec2 p = (2.0*(fragCoord+o)-iResolution.xy)/iResolution.y;
#else    
        vec2 p = (2.0*fragCoord-iResolution.xy)/iResolution.y;
#endif

        // focal length
        const float fl = 2.5;
        
        // ray direction
        vec3 rd = ca * normalize( vec3(p,fl) );

         // ray differentials
        vec2 px = (2.0*(fragCoord+vec2(1.0,0.0))-iResolution.xy)/iResolution.y;
        vec2 py = (2.0*(fragCoord+vec2(0.0,1.0))-iResolution.xy)/iResolution.y;
        vec3 rdx = ca * normalize( vec3(px,fl) );
        vec3 rdy = ca * normalize( vec3(py,fl) );
        
        // render	
        vec3 col = render( ro, rd, rdx, rdy );

        // gain
        // col = col*3.0/(2.5+col);
        
		// gamma
        col = pow( col, vec3(0.4545) );

        tot += col;
#if AA>1
    }
    tot /= float(AA*AA);
#endif
    
    fragColor = vec4( tot, 1.0 );

    if(override)
    {
      fragColor = overrideColor;
    }

}

void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}