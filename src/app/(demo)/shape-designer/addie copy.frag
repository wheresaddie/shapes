
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec2 iResolution;
uniform vec3 iMouse;

const float PI             = 3.14159265359;

//SDFs from https://iquilezles.org/articles/distfunctions/

float dot2( in vec2 v ) { return dot(v,v); }
float dot2( in vec3 v ) { return dot(v,v); }

mat4 rotationMatrix(vec3 axis, float angle)
{
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;
    
    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}

vec3 hsv2rgb(vec3 hsv) { return ((clamp(abs(fract(hsv.x+vec3(0,2,1)/3.)*2.-1.)*3.-1.,0.,1.)-1.)*hsv.y+1.)*hsv.z; }
float checker(vec2 uv, vec2 csize) { return mod(floor(uv.x/csize.x)+floor(uv.y/csize.y),2.); }

vec3 fresnel ( in vec3 f0, in float product )
{
	product = clamp ( product, 0.0, 1.0 );		// saturate
	
	return mix ( f0, vec3 (1.0), pow(1.0 - product, 5.0) );
}

float D_blinn(in float roughness, in float NdH)
{
    float m = roughness * roughness;
    float m2 = m * m;
    float n = 2.0 / m2 - 2.0;
    return (n + 2.0) / (2.0 * PI) * pow(NdH, n);
}

float D_beckmann ( in float roughness, in float NdH )
{
	float m    = roughness * roughness;
	float m2   = m * m;
	float NdH2 = NdH * NdH;
	
	return exp( (NdH2 - 1.0) / (m2 * NdH2) ) / (PI * m2 * NdH2 * NdH2);
}

float D_GGX ( in float roughness, in float NdH )
{
	float m  = roughness * roughness;
	float m2 = m * m;
	float NdH2 = NdH * NdH;
	float d  = (m2 - 1.0) * NdH2 + 1.0;
	
	return m2 / (PI * d * d);
}

float G_schlick ( in float roughness, in float nv, in float nl )
{
    float k = roughness * roughness * 0.5;
    float V = nv * (1.0 - k) + k;
    float L = nl * (1.0 - k) + k;
	
    return 0.25 / (V * L);
}

float G_neumann ( in float nl, in float nv )
{
	return nl * nv / max ( nl, nv );
}

float G_klemen ( in float nl, in float nv, in float vh )
{
	return nl * nv / (vh * vh );
}

float G_default ( in float nl, in float nh, in float nv, in float vh )
{
	return min ( 1.0, min ( 2.0*nh*nv/vh, 2.0*nh*nl/vh ) );
}

/*
vec4 cookTorrance ( Ray h, RayHit rh, Light li)
{
    
    vec3  h    = normalize ( l + v );
    float nh   = dot (n, h);
    float nv   = dot (n, v);
    float nl   = dot (n, l);
    float vh   = dot (v, h);
    float metallness = 0.5;
    vec3  base  = pow ( clr, vec3 ( gamma ) );
    vec3  F0    = mix ( vec3(FDiel), clr, metallness );
	
			// compute Beckman
   	float d = D_beckmann ( roughness, nh );

            // compute Fresnel
    vec3 f = fresnel ( F0, nv );
	
            // default G
    float g = G_default ( nl, nh, nv, vh );
	
			// resulting color
	vec3  ct   = f*(0.25 * d * g / nv);
	vec3  diff = max(nl, 0.0) * ( vec3 ( 1.0 ) - f ) / pi;
	float ks   = 0.5;

	return vec4 ( pow ( diff * base + ks * ct, vec3 ( 1.0 / gamma ) ), 1.0 );
}
*/

#define ZERO (min(iFrame,0))

const int   NUM_SHAPES     = 4;
const int   NUM_LIGHTS     = 2;

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

// Ray marching variables
const int   MAX_STEPS      = 256;
const int   MAX_BOUNCES    = 0;
const int   RAY_ITERATION  = 1;
const float MAX_DISTANCE   = 50.0;
const float SURF_DISTANCE  = 0.000001;
const float STALL_STEP     = 0.01;

const int   MARCHING       = 0;
const int   HIT            = 1;
const int   MISS           = 2;

// Ray type
const int   INITIAL        = 0;  
const int   REFLECT        = 1;
const int   REFRACT        = 2;

// Ray position
const int   OUTSIDE        = 0;
const int   INSIDE         = 1;

//Colors
const vec3 AMBIENT_COLOR     = vec3(0.8, 0.8, 0.9);
const vec3 DIRECTIONAL_COLOR = vec3(0.8, 0.7, 0.8);
const vec3 POINT_COLOR       = vec3(0.8, 0.8, 0.7);

const vec4 RED               = vec4(1.,0.,0.,1.);

//Global Illumination
const float GI_LENGTH        = 1.6;
const float GI_STRENGTH      = 0.1;
const float AO_STRENGTH      = 0.3;
 
//Array sizes and indexes
const int NUM_RAYS = 40;
const int GI_RAY_INDEX = 32;
const int N_RAY_INDEX = 33;
const int LIGHT_RAY_INDEX = 36;

vec4 overrideColor = RED;
bool override = false;

vec3 camPos;
vec3 camTgt;
float camNear;

int lightType[NUM_LIGHTS+1];
vec3 lightColor[NUM_LIGHTS+1];
bool lightRanged[NUM_LIGHTS+1];
float lightR[NUM_LIGHTS+1];
vec3 lightDir[NUM_LIGHTS+1];
vec3 lightPos[NUM_LIGHTS+1];

bool matEmissive[NUM_SHAPES+1];
vec3 matDiffuseColor[NUM_SHAPES+1];
vec3 matTransparentColor[NUM_SHAPES+1]; 
vec3 matGlowColor[NUM_SHAPES+1];
float matDiffuseStrength[NUM_SHAPES+1];
float matSpecularStrength[NUM_SHAPES+1];
float matShininess[NUM_SHAPES+1]; 
float matReflectivity[NUM_SHAPES+1]; 
float matTransparency[NUM_SHAPES+1]; 
float matAttenuation[NUM_SHAPES+1];
float matAttenuationStrength[NUM_SHAPES+1]; 
float matGlow[NUM_SHAPES+1]; 
float matRefraction[NUM_SHAPES+1];

int shapeType[NUM_SHAPES+1];
int shapeId[NUM_SHAPES+1];
vec2 s_l[NUM_SHAPES+1]; 
vec2 s_c[NUM_SHAPES+1];
vec3 s_a[NUM_SHAPES+1];
vec3 s_b[NUM_SHAPES+1]; 
vec3 s_n[NUM_SHAPES+1]; 
vec3 shapePos[NUM_SHAPES+1];
float s_h[NUM_SHAPES+1];
float s_r[NUM_SHAPES+1]; 
float s_r1[NUM_SHAPES+1];
float s_r2[NUM_SHAPES+1];
int shapeMat[NUM_SHAPES+1];
mat4 shapeTransform[NUM_SHAPES+1];


vec3 rayPos[NUM_RAYS];
vec3 rayDir[NUM_RAYS];
float rayDistance[NUM_RAYS];
int rayStepShape[NUM_RAYS];
float rayStepDistance[NUM_RAYS];
int rayHitShape[NUM_RAYS];
float rayHitDistance[NUM_RAYS];
vec3 rayHitPos[NUM_RAYS];
vec3 rayHitNormal[NUM_RAYS];
int rayFromHitShape[NUM_RAYS];
float rayFromHitDistance[NUM_RAYS];
vec3 rayFromHitPos[NUM_RAYS];
vec3 rayFromHitNormal[NUM_RAYS];
int rayStepCount[NUM_RAYS];
vec4 rayColor[NUM_RAYS];
vec4 rayInnerColor[NUM_RAYS]; //for refraction
int rayHitOrMiss[NUM_RAYS];
bool rayInitialized[NUM_RAYS];
int rayType[NUM_RAYS];
int rayInOrOut[NUM_RAYS];

void initScene() {
  camPos = vec3(-4.0,2.0,4.0);
  camTgt = vec3(0.0,1.0,0.0);
  camNear = 1.73205081 * 1.;

  lightType[0] = OMNI;
  lightColor[0] = AMBIENT_COLOR;

  lightType[1] = DIRECTIONAL;
  lightColor[1] = DIRECTIONAL_COLOR;
  lightDir[1] = vec3(0.0, -1.0, 0.0);
  
  lightType[2] = POINT;
  lightColor[2] = POINT_COLOR;
  lightPos[2] = vec3(0.0, 4.0, 0.0);
  
  matEmissive[0] = false;
  matDiffuseStrength[0] = 1.0;
  matDiffuseColor[0] = vec3(0.4, 0.4, 0.4);
  matSpecularStrength[0] = 0.;
  matShininess[0] = 24.0;
  matReflectivity[0] = 0.;
  matTransparency[0] = 0.;
  matGlow[0] = 0.;
  
  matEmissive[1] = false;
  matDiffuseStrength[1] = 1.0;
  matDiffuseColor[1] = vec3(0.6, 0.2, 0.3);
  matSpecularStrength[1] = 5.5;
  matShininess[1] = 48.0;
  matReflectivity[1] = 0.;
  matTransparency[1] = 0.;
  matAttenuation[1] = 0.001;
  matAttenuationStrength[1] = 13.;
  matTransparentColor[1] = vec3(1.0, 0.8, 0.8);
  matRefraction[1] = 1.5;
  matGlow[1] = 0.;
  
  matEmissive[2] = false;
  matDiffuseStrength[2] = 1.0;
  matDiffuseColor[2] = vec3(0.4, 0.2, 0.6);
  matSpecularStrength[2] = 1.0;
  matShininess[2] = 48.0;
  matReflectivity[2] = 0.;
  matTransparency[2] = 0.;
  matTransparentColor[2] = vec3(0.6, 0.3, 0.4);
  matRefraction[2] = 1.1;
  matAttenuation[2] = 0.5;
  matAttenuationStrength[2] = 2.0;
  matGlow[2] = 0.;
  
  matEmissive[3] = false;
  matDiffuseStrength[3] = 0.6;
  matDiffuseColor[3] = vec3(1.0, 1.0, 1.0);
  matSpecularStrength[3] = 1.0;
  matShininess[3] = 48.0;
  matReflectivity[3] = 0.;
  matTransparency[3] = 0.;
  
  shapeType[0] = PLANE;
  shapeId[0] = 0;
  s_n[0] = vec3(0.,1.,0.);
  s_h[0] = 0.5;
  shapeMat[0] = 0;
  shapePos[0] = vec3(0.,0.,0.);
  shapeTransform[0] = mat4(1.0, 0.0, 0.0, 0.0,  
                           0.0, 1.0, 0.0, 0.0,  
                           0.0, 0.0, 1.0, 0.0,  
                           0.0, 0.0, 0.0, 1.0); 
  
  shapeType[1] = SPHERE;
  shapeId[1] = 1;
  s_r[1] = 1.;
  shapeMat[1] = 1;
  shapePos[1] = vec3(-1.25,1.5,0.);
  shapeTransform[1] = mat4(1.0, 0.0, 0.0, 0.0,  
                           0.0, 1.0, 0.0, 0.0,  
                           0.0, 0.0, 1.0, 0.0,  
                           0.0, 0.0, 0.0, 1.0);

  shapeType[2] = BOX;
  shapeId[2] = 2;
  s_a[2] = vec3(1.,1.,1.);
  shapeMat[2] = 2;
  shapePos[2] = vec3(1.25,1.5,0.);
  shapeTransform[2] = mat4(1.0, 0.0, 0.0, 0.0,  
                           0.0, 1.0, 0.0, 0.0,  
                           0.0, 0.0, 1.0, 0.0,  
                           0.0, 0.0, 0.0, 1.0);   
  
  shapeType[3] = CONE;
  shapeId[3] = 3;
  s_c[3] = vec2(1.0,2.0);
  s_h[3] = 2.0;
  shapeMat[3] = 3;
  shapePos[3] = vec3(0.,2.5,2.25);
  shapeTransform[3] = mat4(1.0, 0.0, 0.0, 0.0,  
                           0.0, 1.0, 0.0, 0.0,  
                           0.0, 0.0, 1.0, 0.0,  
                           0.0, 0.0, 0.0, 1.0);
                           
  shapeType[4] = BOX;
  shapeId[2] = 4;
  s_a[2] = vec3(1.,1.,1.);
  shapeMat[4] = 2;
  shapePos[4] = vec3(1.25,1.5,0.);
  shapeTransform[4] = mat4(1.0, 0.0, 0.0, 0.0,  
                          0.0, 1.0, 0.0, 0.0,  
                           0.0, 0.0, 1.0, 0.0,  
                           0.0, 0.0, 0.0, 1.0);   
}

mat3 cameraMatrix() {
    vec3 i = normalize(camPos - camTgt);
    vec3 j = normalize(cross(i,vec3(0.,1.,0.)));
    return mat3(j,normalize(cross(j,i)),i);
}

void rayScreen(in vec2 uv)
{
    rayPos[0] = camPos;
    rayDir[0] = normalize(cameraMatrix() * vec3(uv.xy, -camNear));
    rayDistance[0] = 0.;
    rayStepCount[0] = 0;
    rayColor[0] = vec4(0.,0.,0.,1.);
    rayInnerColor[0] = vec4(0.,0.,0.,1.);
    rayHitOrMiss[0] = MARCHING;
    rayStepShape[0] = -1;
    rayStepDistance[0] = 0.;
    rayInitialized[0] = true;
    rayType[0] = INITIAL;
    rayInOrOut[0] = OUTSIDE;
}

void ray(int index, vec3 pos, vec3 dir, int type, int inOrOut) 
{
    rayPos[index] = pos;
    rayDir[index] = dir;
    rayDistance[index] = 0.;
    rayStepCount[index] = 0;
    rayColor[index] = vec4(0.,0.,0.,1.);
    rayInnerColor[index] = vec4(0.,0.,0.,1.);
    rayHitOrMiss[index] = MARCHING;
    rayStepShape[index] = -1;
    rayStepDistance[index] = 0.;
    rayInitialized[index] = true;
    rayType[index] = type;
    rayInOrOut[index] = inOrOut;
}

void ray(int index, vec3 pos, vec3 dir)
{
    ray(index, pos, dir, INITIAL, OUTSIDE);
}

void march( int index ) 
{
    float distance = MAX_DISTANCE * 2.;
    int foundShape = -1;

    for(int i = 0; i < NUM_SHAPES + 1 + ZERO; i++)
    {
        vec3 newPos = (inverse(shapeTransform[i]) * vec4((rayPos[index] + rayDir[index] * rayDistance[index]) - shapePos[i], 1.0)).xyz;
        float newD;
        
        if(shapeType[i] == PLANE)
        {
          newD = dot(newPos,s_n[i]) + s_h[i];
        }
        else if(shapeType[i] == SPHERE)
        {
          newD = length(newPos)-s_r[i];
        }
        else if(shapeType[i] == BOX)
        {
          vec3 q = abs(newPos) - s_a[i];
          newD = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
        }
        else if(shapeType[i] == ROUND_BOX)
        {
          vec3 q = abs(newPos) - s_a[i] + s_r[i];
          newD = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - s_r[i];
        }
        else if(shapeType[i] == TORUS)
        {
          vec2 q = vec2(length(newPos.xz)-s_r1[i],newPos.y);
          newD = length(q)-s_r2[i];
        }
        else if(shapeType[i] == LINK)
        {
          vec3 q = vec3( newPos.x, max(abs(newPos.y)-s_h[i],0.0), newPos.z );
          newD = length(vec2(length(q.xy)-s_r1[i],q.z)) - s_r2[i];
        }
        else if(shapeType[i] == CONE)
        {
          vec2 q = s_h[i]*vec2(s_c[i].x/s_c[i].y,-1.0);
            
          vec2 w = vec2( length(newPos.xz), newPos.y );
          vec2 a = w - q*clamp( dot(w,q)/dot(q,q), 0.0, 1.0 );
          vec2 b = w - q*vec2( clamp( w.x/q.x, 0.0, 1.0 ), 1.0 );
          float k = sign( q.y );
          float d = min(dot( a, a ),dot(b, b));
          float s = max( k*(w.x*q.y-w.y*q.x),k*(w.y-q.y)  );
          newD = sqrt(d)*sign(s);
        }
        else if(shapeType[i] == HEX_PRISM)
        {
          const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
          newPos = abs(newPos);
          newPos.xy -= 2.0*min(dot(k.xy, newPos.xy), 0.0)*k.xy;
          vec2 d = vec2(
              length(newPos.xy-vec2(clamp(newPos.x,-k.z*s_l[i].x,k.z*s_l[i].x), s_l[i].x))*sign(newPos.y-s_l[i].x),
              newPos.z-s_l[i].y );
          newD = min(max(d.x,d.y),0.0) + length(max(d,0.0));
        }
        else if(shapeType[i] == TRI_PRISM)
        {
          vec3 q = abs(newPos);
          newD = max(q.z-s_l[i].y,max(q.x*0.866025+newPos.y*0.5,-newPos.y)-s_l[i].x*0.5);
        }
        else if(shapeType[i] == CAPSULE)
        {
          vec3 pa = newPos - s_a[i], ba = s_b[i] - s_a[i];
          float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
          newD = length( pa - ba*h ) - s_r[i];
        }
        else if(shapeType[i] == CYLINDER)
        {
          vec3  ba = s_b[i] - s_a[i];
          vec3  pa = newPos - s_a[i];
          float baba = dot(ba,ba);
          float paba = dot(pa,ba);
          float x = length(pa*baba-ba*paba) - s_r[i]*baba;
          float y = abs(paba-baba*0.5)-baba*0.5;
          float x2 = x*x;
          float y2 = y*y*baba;
          float d = (max(x,y)<0.0)?-min(x2,y2):(((x>0.0)?x2:0.0)+((y>0.0)?y2:0.0));
          newD = sign(d)*sqrt(abs(d))/baba;
        }
        else if(shapeType[i] == ROUND_CYLINDER)
        {
          vec2 d = vec2( length(newPos.xz)-2.0*s_r1[i]+s_r2[i], abs(newPos.y) - s_h[i] );
          newD = min(max(d.x,d.y),0.0) + length(max(d,0.0)) - s_r2[i];
        }
        if(shapeType[i] == CUT_CONE)
        {
          float ra = s_r1[i];
          float rb = s_r2[i];
          float rba  = rb-ra;
          float baba = dot(s_b[i]-s_a[i],s_b[i]-s_a[i]);
          float papa = dot(newPos-s_a[i],newPos-s_a[i]);
          float paba = dot(newPos-s_a[i],s_b[i]-s_a[i])/baba;
          float x = sqrt( papa - paba*paba*baba );
          float cax = max(0.0,x-((paba<0.5)?ra:rb));
          float cay = abs(paba-0.5)-0.5;
          float k = rba*rba + baba;
          float f = clamp( (rba*(x-ra)+paba*baba)/k, 0.0, 1.0 );
          float cbx = x-ra - f*rba;
          float cby = paba - f;
          float s = (cbx<0.0 && cay<0.0) ? -1.0 : 1.0;
          newD = s*sqrt( min(cax*cax + cay*cay*baba, cbx*cbx + cby*cby*baba) );
        }
        else if(shapeType[i] == SOLID_ANGLE)
        {
          // c is the sin/cos of the angle
          vec2 q = vec2( length(newPos.xz), newPos.y );
          float l = length(q) - s_r1[i];
          float m = length(q - s_c[i]*clamp(dot(q,s_c[i]),0.0,s_r1[i]) );
          newD = max(l,m*sign(s_c[i].y*q.x-s_c[i].x*q.y));
        }
        else if(shapeType[i] == CUT_SPHERE)
        {
          // sampling independent computations (only depend on shape)
          float w = sqrt(s_r[i]*s_r[i]-s_h[i]*s_h[i]);

          // sampling dependant computations
          vec2 q = vec2( length(newPos.xz), newPos.y );
          float s = max( (s_h[i]-s_r[i])*q.x*q.x+w*w*(s_h[i]+s_r[i]-2.0*q.y), s_h[i]*q.x-w*q.y );
          newD = (s<0.0) ? length(q)-s_r[i] : (q.x<w) ? s_h[i] - q.y     : length(q-vec2(w,s_h[i]));
        }
        else if(shapeType[i] == ROUND_CONE)
        {
          // sampling independent computations (only depend on shape)
          vec3  ba = s_b[i] - s_a[i];
          float l2 = dot(ba,ba);
          float rr = s_r1[i] - s_r2[i];
          float a2 = l2 - rr*rr;
          float il2 = 1.0/l2;
            
          // sampling dependant computations
          vec3 pa = newPos - s_a[i];
          float y = dot(pa,ba);
          float z = y - l2;
          float x2 = dot2( pa*l2 - ba*y );
          float y2 = y*y*l2;
          float z2 = z*z*l2;

          // single square root!
          float k = sign(rr)*rr*rr*x2;
          if( sign(z)*a2*z2>k ) 
          {
            newD = sqrt(x2 + z2)        *il2 - s_r2[i];
          }
          else if( sign(y)*a2*y2<k ) 
          {
            newD = sqrt(x2 + y2)        *il2 - s_r1[i];
          }
          else
          {
            newD = (sqrt(x2*a2*il2)+y*rr)*il2 - s_r1[i];
          }
        }
        else if(shapeType[i] == ELLIPSOID)
        {
          vec3 r3 = vec3(s_r[i], s_r1[i], s_r2[i]);
          float k0 = length(newPos/r3);
          float k1 = length(newPos/(r3*r3));
          newD = k0*(k0-1.0)/k1;
        }
        else if(shapeType[i] == FOOTBALL)
        {
          vec3  c = (s_a[i]+s_b[i])*0.5;
          float l = length(s_b[i]-s_a[i]);
          vec3  v = (s_b[i]-s_a[i])/l;
          float y = dot(newPos-c,v);
          vec2  q = vec2(length(newPos-c-y*v),abs(y));
          
          float r = 0.5*l;
          float d = 0.5*(r*r-s_h[i]*s_h[i])/s_h[i];
          vec3  h2 = (r*q.x<d*(q.y-r)) ? vec3(0.0,r,0.0) : vec3(-d,0.0,d+s_h[i]);
      
          newD = length(q-h2.xy) - h2.z;
        }
        else if(shapeType[i] == OCTAHEDRON)
        {
          vec3 p = abs(newPos);
          float m = p.x+p.y+p.z-s_r[i];
          bool alreadySet = false;
          vec3 q;
               if( 3.0*p.x < m ) q = p.xyz;
          else if( 3.0*p.y < m ) q = p.yzx;
          else if( 3.0*p.z < m ) q = p.zxy;
          else { 
            newD = m*0.57735027;
            alreadySet = true;
          }
          if(!alreadySet)
          {
            float k = clamp(0.5*(q.z-q.y+s_r[i]),0.0,s_r[i]); 
            newD = length(vec3(q.x,q.y-s_r[i]+k,q.z-k)); 
          } 
        }
        else if(shapeType[i] == PYRAMID)
        {
          float m2 = s_r[i]*s_r[i] + 0.25;

          vec3 p = newPos; 
          p.xz = abs(p.xz);
          p.xz = (p.z>p.x) ? p.zx : p.xz;
          p.xz -= 0.5;

          vec3 q = vec3( p.z, s_r[i]*p.y - 0.5*p.x, s_r[i]*p.x + 0.5*p.y);
          
          float s = max(-q.x,0.0);
          float t = clamp( (q.y-0.5*p.z)/(m2+0.25), 0.0, 1.0 );
            
          float a = m2*(q.x+s)*(q.x+s) + q.y*q.y;
          float b = m2*(q.x+0.5*t)*(q.x+0.5*t) + (q.y-m2*t)*(q.y-m2*t);
            
          float d2 = min(q.y,-q.x*m2-q.y*0.5) > 0.0 ? 0.0 : min(a,b);
            
          newD = sqrt( (d2+q.z*q.z)/m2 ) * sign(max(q.z,-p.y));
        }
        
        if(abs(newD) < distance)
        {
            distance = abs(newD);
            foundShape = i;
        }
    }
    rayStepShape[index] = foundShape;
    rayStepDistance[index] = distance * 0.9;
    rayStepCount[index] += 1;
}

float simpleMarch(vec3 pos) 
{
    float distance = MAX_DISTANCE * 2.;
    for(int i = 0; i < NUM_SHAPES + 1 + ZERO; i++)
    {
        vec3 newPos = (inverse(shapeTransform[i]) * vec4(pos - shapePos[i], 1.0)).xyz;
        float newD;

        if(shapeType[i] == PLANE)
        {
          newD = dot(newPos,s_n[i]) + s_h[i];
        }
        else if(shapeType[i] == SPHERE)
        {
          newD = length(newPos)-s_r[i];
        }
        else if(shapeType[i] == BOX)
        {
          vec3 q = abs(newPos) - s_a[i];
          newD = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
        }
        else if(shapeType[i] == ROUND_BOX)
        {
          vec3 q = abs(newPos) - s_a[i] + s_r[i];
          newD = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - s_r[i];
        }
        else if(shapeType[i] == TORUS)
        {
          vec2 q = vec2(length(newPos.xz)-s_r1[i],newPos.y);
          newD = length(q)-s_r2[i];
        }
        else if(shapeType[i] == LINK)
        {
          vec3 q = vec3( newPos.x, max(abs(newPos.y)-s_h[i],0.0), newPos.z );
          newD = length(vec2(length(q.xy)-s_r1[i],q.z)) - s_r2[i];
        }
        else if(shapeType[i] == CONE)
        {
          vec2 q = s_h[i]*vec2(s_c[i].x/s_c[i].y,-1.0);
            
          vec2 w = vec2( length(newPos.xz), newPos.y );
          vec2 a = w - q*clamp( dot(w,q)/dot(q,q), 0.0, 1.0 );
          vec2 b = w - q*vec2( clamp( w.x/q.x, 0.0, 1.0 ), 1.0 );
          float k = sign( q.y );
          float d = min(dot( a, a ),dot(b, b));
          float s = max( k*(w.x*q.y-w.y*q.x),k*(w.y-q.y)  );
          newD = sqrt(d)*sign(s);
        }
        else if(shapeType[i] == HEX_PRISM)
        {
          const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
          newPos = abs(newPos);
          newPos.xy -= 2.0*min(dot(k.xy, newPos.xy), 0.0)*k.xy;
          vec2 d = vec2(
              length(newPos.xy-vec2(clamp(newPos.x,-k.z*s_l[i].x,k.z*s_l[i].x), s_l[i].x))*sign(newPos.y-s_l[i].x),
              newPos.z-s_l[i].y );
          newD = min(max(d.x,d.y),0.0) + length(max(d,0.0));
        }
        else if(shapeType[i] == TRI_PRISM)
        {
          vec3 q = abs(newPos);
          newD = max(q.z-s_l[i].y,max(q.x*0.866025+newPos.y*0.5,-newPos.y)-s_l[i].x*0.5);
        }
        else if(shapeType[i] == CAPSULE)
        {
          vec3 pa = newPos - s_a[i], ba = s_b[i] - s_a[i];
          float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
          newD = length( pa - ba*h ) - s_r[i];
        }
        else if(shapeType[i] == CYLINDER)
        {
          vec3  ba = s_b[i] - s_a[i];
          vec3  pa = newPos - s_a[i];
          float baba = dot(ba,ba);
          float paba = dot(pa,ba);
          float x = length(pa*baba-ba*paba) - s_r[i]*baba;
          float y = abs(paba-baba*0.5)-baba*0.5;
          float x2 = x*x;
          float y2 = y*y*baba;
          float d = (max(x,y)<0.0)?-min(x2,y2):(((x>0.0)?x2:0.0)+((y>0.0)?y2:0.0));
          newD = sign(d)*sqrt(abs(d))/baba;
        }
        else if(shapeType[i] == ROUND_CYLINDER)
        {
          vec2 d = vec2( length(newPos.xz)-2.0*s_r1[i]+s_r2[i], abs(newPos.y) - s_h[i] );
          newD = min(max(d.x,d.y),0.0) + length(max(d,0.0)) - s_r2[i];
        }
        if(shapeType[i] == CUT_CONE)
        {
          float ra = s_r1[i];
          float rb = s_r2[i];
          float rba  = rb-ra;
          float baba = dot(s_b[i]-s_a[i],s_b[i]-s_a[i]);
          float papa = dot(newPos-s_a[i],newPos-s_a[i]);
          float paba = dot(newPos-s_a[i],s_b[i]-s_a[i])/baba;
          float x = sqrt( papa - paba*paba*baba );
          float cax = max(0.0,x-((paba<0.5)?ra:rb));
          float cay = abs(paba-0.5)-0.5;
          float k = rba*rba + baba;
          float f = clamp( (rba*(x-ra)+paba*baba)/k, 0.0, 1.0 );
          float cbx = x-ra - f*rba;
          float cby = paba - f;
          float s = (cbx<0.0 && cay<0.0) ? -1.0 : 1.0;
          newD = s*sqrt( min(cax*cax + cay*cay*baba, cbx*cbx + cby*cby*baba) );
        }
        else if(shapeType[i] == SOLID_ANGLE)
        {
          // c is the sin/cos of the angle
          vec2 q = vec2( length(newPos.xz), newPos.y );
          float l = length(q) - s_r1[i];
          float m = length(q - s_c[i]*clamp(dot(q,s_c[i]),0.0,s_r1[i]) );
          newD = max(l,m*sign(s_c[i].y*q.x-s_c[i].x*q.y));
        }
        else if(shapeType[i] == CUT_SPHERE)
        {
          // sampling independent computations (only depend on shape)
          float w = sqrt(s_r[i]*s_r[i]-s_h[i]*s_h[i]);

          // sampling dependant computations
          vec2 q = vec2( length(newPos.xz), newPos.y );
          float s = max( (s_h[i]-s_r[i])*q.x*q.x+w*w*(s_h[i]+s_r[i]-2.0*q.y), s_h[i]*q.x-w*q.y );
          newD = (s<0.0) ? length(q)-s_r[i] : (q.x<w) ? s_h[i] - q.y     : length(q-vec2(w,s_h[i]));
        }
        else if(shapeType[i] == ROUND_CONE)
        {
          // sampling independent computations (only depend on shape)
          vec3  ba = s_b[i] - s_a[i];
          float l2 = dot(ba,ba);
          float rr = s_r1[i] - s_r2[i];
          float a2 = l2 - rr*rr;
          float il2 = 1.0/l2;
            
          // sampling dependant computations
          vec3 pa = newPos - s_a[i];
          float y = dot(pa,ba);
          float z = y - l2;
          float x2 = dot2( pa*l2 - ba*y );
          float y2 = y*y*l2;
          float z2 = z*z*l2;

          // single square root!
          float k = sign(rr)*rr*rr*x2;
          if( sign(z)*a2*z2>k ) 
          {
            newD = sqrt(x2 + z2)        *il2 - s_r2[i];
          }
          else if( sign(y)*a2*y2<k ) 
          {
            newD = sqrt(x2 + y2)        *il2 - s_r1[i];
          }
          else
          {
            newD = (sqrt(x2*a2*il2)+y*rr)*il2 - s_r1[i];
          }
        }
        else if(shapeType[i] == ELLIPSOID)
        {
          vec3 r3 = vec3(s_r[i], s_r1[i], s_r2[i]);
          float k0 = length(newPos/r3);
          float k1 = length(newPos/(r3*r3));
          newD = k0*(k0-1.0)/k1;
        }
        else if(shapeType[i] == FOOTBALL)
        {
          vec3  c = (s_a[i]+s_b[i])*0.5;
          float l = length(s_b[i]-s_a[i]);
          vec3  v = (s_b[i]-s_a[i])/l;
          float y = dot(newPos-c,v);
          vec2  q = vec2(length(newPos-c-y*v),abs(y));
          
          float r = 0.5*l;
          float d = 0.5*(r*r-s_h[i]*s_h[i])/s_h[i];
          vec3  h2 = (r*q.x<d*(q.y-r)) ? vec3(0.0,r,0.0) : vec3(-d,0.0,d+s_h[i]);
      
          newD = length(q-h2.xy) - h2.z;
        }
        else if(shapeType[i] == OCTAHEDRON)
        {
          vec3 p = abs(newPos);
          float m = p.x+p.y+p.z-s_r[i];
          bool alreadySet = false;
          vec3 q;
               if( 3.0*p.x < m ) q = p.xyz;
          else if( 3.0*p.y < m ) q = p.yzx;
          else if( 3.0*p.z < m ) q = p.zxy;
          else { 
            newD = m*0.57735027;
            alreadySet = true;
          }
          if(!alreadySet)
          {
            float k = clamp(0.5*(q.z-q.y+s_r[i]),0.0,s_r[i]); 
            newD = length(vec3(q.x,q.y-s_r[i]+k,q.z-k)); 
          } 
        }
        else if(shapeType[i] == PYRAMID)
        {
          float m2 = s_r[i]*s_r[i] + 0.25;

          vec3 p = newPos; 
          p.xz = abs(p.xz);
          p.xz = (p.z>p.x) ? p.zx : p.xz;
          p.xz -= 0.5;

          vec3 q = vec3( p.z, s_r[i]*p.y - 0.5*p.x, s_r[i]*p.x + 0.5*p.y);
          
          float s = max(-q.x,0.0);
          float t = clamp( (q.y-0.5*p.z)/(m2+0.25), 0.0, 1.0 );
            
          float a = m2*(q.x+s)*(q.x+s) + q.y*q.y;
          float b = m2*(q.x+0.5*t)*(q.x+0.5*t) + (q.y-m2*t)*(q.y-m2*t);
            
          float d2 = min(q.y,-q.x*m2-q.y*0.5) > 0.0 ? 0.0 : min(a,b);
            
          newD = sqrt( (d2+q.z*q.z)/m2 ) * sign(max(q.z,-p.y));
        }

        if(abs(newD) < distance)
        {
            distance = newD;
        }
    }
    return distance * 0.9;
}

void processMarch(int index)
{
    rayDistance[index] += rayStepDistance[index];
}

void trace(int index) 
{
    int stallCount = 0;
    float previousStepDistance = 0.;
    bool stalled = false;
    vec3 accumulated;
    for(int i = 0; i <= MAX_STEPS + 1; i++)
    {
        march(index);
        processMarch(index);
        
        /*
        if(rayStepCount[index] > MAX_STEPS / 2 && rayStepDistance[index] < STALL_STEP && rayStepDistance[index] <= previousStepDistance && rayStepDistance[index] > previousStepDistance * 0.95)
        {
            stallCount++;
        }
        if(stallCount == 10)
        {
            int shapeIndex = rayStepShape[index];
            if(shapeType[shapeIndex] == PLANE)
            {
                vec3 add = vec3(0.,0.001,0.);
                rayPos[index] += vec3(0.,0.001,0.);
                accumulated += add;
            }
            else
            {
                if(rayInOrOut[index] == OUTSIDE)
                {
                    vec3 add = normalize(rayPos[index] - shapePos[shapeIndex]) * 0.01;
                    accumulated += add;
                    rayPos[index] += add;
                }
                else if(rayInOrOut[index] == INSIDE)
                {
                    vec3 add = -normalize(rayPos[index] - shapePos[shapeIndex]) * 0.01;
                    accumulated = add;
                    rayPos[index] += add;
                }
            }
   
            stallCount = 0;
            stalled = true;
        }
        previousStepDistance = rayStepDistance[index];
        */
        if(rayDistance[index] > MAX_DISTANCE || rayStepCount[index] > MAX_STEPS)
        {
            rayHitOrMiss[index] = MISS;
            break;
        }
        else if(abs(rayStepDistance[index]) < SURF_DISTANCE)
        {
            rayHitOrMiss[index] = HIT;
            break;
        }
    }
    rayPos[index] -= accumulated;
}

float map(vec3 pos, vec3 dir) {
    float distance = 0.;
    for(int i = 0; i < MAX_STEPS + ZERO; i++)
    {
        float d = abs(simpleMarch(pos + dir * distance));

        distance += d;
        if(distance >= MAX_DISTANCE)
        {
            return distance;
        }
        else if(abs(d) < SURF_DISTANCE)
        {
            return distance;
        }
    }
    return MAX_DISTANCE;
}

// https://iquilezles.org/articles/normalsSDF
vec3 calcNormal( int index )
{
    float dist = rayDistance[index];

    float h = 0.0001;      // replace by an appropriate value
    vec3 n = vec3(0.0);
    vec2 v = vec2(h,0);
    ray(N_RAY_INDEX, rayPos[index] + v.xyy, rayDir[index], rayType[index], rayInOrOut[index]);
    trace(N_RAY_INDEX);
    ray(N_RAY_INDEX + 1, rayPos[index] + v.yxy, rayDir[index], rayType[index], rayInOrOut[index]);
    trace(N_RAY_INDEX+1);
    ray(N_RAY_INDEX + 2, rayPos[index] + v.yyx, rayDir[index], rayType[index], rayInOrOut[index]);
    trace(N_RAY_INDEX+2);
    return normalize(vec3(rayDistance[N_RAY_INDEX],rayDistance[N_RAY_INDEX+1],rayDistance[N_RAY_INDEX+2]) - dist);
}

void processHit(int index)
{
    rayHitDistance[index] = rayDistance[index];
    rayHitShape[index] = rayStepShape[index];
    rayHitPos[index] = rayPos[index] + rayDir[index] * rayDistance[index];
    if(rayHitShape[index] == 0)
    {
        rayHitNormal[index] = vec3(0.,1.,0.);      
    }
    else
    {
        rayHitNormal[index] = calcNormal(index);
    }
}

vec3 getBackground(int index) {
    return AMBIENT_COLOR * (1.0 - rayDir[index].y) * 0.75;
}

vec4 gi(int index) {
  vec4 col = vec4(0);
  for (int i=0; i<4; i++) {
    float hr = .01 + float(i) * GI_LENGTH / 4.;
    ray(GI_RAY_INDEX, rayHitPos[index], rayHitNormal[index]);
    rayDistance[GI_RAY_INDEX] = hr;
    
    march(GI_RAY_INDEX);
    int shapeIndex = rayStepShape[index];
    int materialIndex = shapeMat[shapeIndex];
    col += vec4(matDiffuseColor[materialIndex], 1.) * (hr - rayStepDistance[GI_RAY_INDEX]);
  }
  col.rgb *= GI_STRENGTH / GI_LENGTH;
  col.w = clamp(1.-col.w * AO_STRENGTH / GI_LENGTH, 0., 1.);
  return col;
}

float calcSoftShadow( int index, float mint, float maxt, float w )
{
    float t = mint;
    float res = 1.0;
    for( int i=0; (i < MAX_STEPS + ZERO) && t<maxt; i++ )
    {
        float h = simpleMarch(rayPos[index] + rayDir[index] * t);
        res = min( res, w*h/t );
        t += clamp(h, 0.05, 0.50);
        if( res<-1.0 || t>maxt ) break;
    }
    res = max(res, -1.0);
    return 0.25 * (1.0 + res)*(1.0+res)*(2.0-res);
}

vec3 lighting(int index) {
    vec3 color = vec3(0.);
    for(int i = 0; i < NUM_LIGHTS + 1 + ZERO; i++)
    {
        int shapeIndex = rayHitShape[index];
        int materialIndex = shapeMat[shapeIndex];
        if(lightType[i] == OMNI)
        {
            color += lightColor[i];
        }
        else if (lightType[i] == DIRECTIONAL)
        {
            vec3 L = normalize(-lightDir[i]);
            vec3 N = rayHitNormal[index];
            vec3 R = reflect(-L,N);
            vec3 V = normalize(camPos - rayHitPos[index]);
            ray(LIGHT_RAY_INDEX, rayHitPos[index] + rayHitNormal[index] * 0.01, L);
            float shadow = calcSoftShadow(LIGHT_RAY_INDEX, 0.01, 10.0, 48.);
            float diffuse = max(dot(L,N), 0.0);
            float dotRV = clamp(dot(R,V), 0., 1.);
            float specular = matSpecularStrength[materialIndex] * pow(dotRV, matShininess[materialIndex]);
            color += lightColor[0] * (diffuse + specular) * shadow;
        }
        else if (lightType[i] == POINT)
        {
            vec3 L = normalize(lightPos[i] - rayHitPos[index]);
            vec3 N = rayHitNormal[index];
            vec3 R = reflect(-L,N);
            vec3 V = normalize(camPos - rayHitPos[index]);
            
            ray(LIGHT_RAY_INDEX, rayHitPos[index] + rayHitNormal[index] * 0.01, L);
            float shadow = calcSoftShadow(LIGHT_RAY_INDEX, 0.01, 10.0, 48.);
            float diffuse = max(dot(L,N), 0.0);
            float dotRV = clamp(dot(R,V), 0., 1.);
            float specular = matSpecularStrength[materialIndex] * pow(dotRV, matShininess[materialIndex]);
            color += lightColor[0] * (diffuse + specular) * shadow;
        }
    }
    return color;
}

void traceOut(int index, int shape) {
    float mixVal;
    if(rayType[index] == INITIAL)
    {
        mixVal = 1.;
    }
    else if(rayType[index] == REFLECT)
    {
        mixVal = matReflectivity[shapeMat[shape]];
    }
    else if(rayType[index] == REFRACT)
    {
        mixVal = matTransparency[shapeMat[shape]];
    }
    trace(index);
    if(rayHitOrMiss[index] == HIT)
    {
        processHit(index);
        vec3 diffuse;
        int shapeIndex = rayHitShape[index];
        diffuse = matDiffuseColor[shapeMat[shapeIndex]] * matDiffuseStrength[shapeMat[shapeIndex]];
        vec3 light = lighting(index);

        vec4 gi = gi(index);

        rayColor[index] = vec4((light * diffuse) * gi.w + gi.rgb, mixVal);
    }
    else if(rayHitOrMiss[index] == MISS) 
    {
        rayColor[index] = vec4(getBackground(index), mixVal);
    }
}

void traceIn(int index) {
    trace(index);
    if(rayHitOrMiss[index] == HIT)
    {
        processHit(index);
    }
    int shapeIndex = rayHitShape[index];
    rayInnerColor[index] = vec4(matTransparentColor[shapeMat[shapeIndex]], pow(1. - matAttenuation[shapeMat[shapeIndex]], (rayDistance[index],matAttenuationStrength[shapeMat[shapeIndex]])));
}

void reflectRay(int index, int reflectIndex) {
    int shapeIndex = rayHitShape[index]; 

    if(rayHitShape[index] == 0)
    {
        ray(reflectIndex, rayHitPos[index] + vec3(0.,0.001,0.), reflect(normalize(rayHitPos[index] - rayPos[index]), rayHitNormal[index]), REFLECT, OUTSIDE);
    }
    else
    {
        ray(reflectIndex, rayHitPos[index] + normalize(rayHitPos[index] - shapePos[shapeIndex]) * 0.001, reflect(normalize(rayHitPos[index] - rayPos[index]), rayHitNormal[index]), REFLECT, OUTSIDE);      
    }
}

void refractRayIn(int index, int refractIndex) {
    int shapeIndex = rayHitShape[index];
    ray(refractIndex, rayHitPos[index] - normalize(rayHitPos[index] - shapePos[shapeIndex]) * 0.001, refract(normalize(rayHitPos[index] - rayPos[index]), rayHitNormal[index], 1./matRefraction[shapeMat[shapeIndex]]), REFRACT, INSIDE);
}

void refractRayOut(int index) {
    int shapeIndex = rayHitShape[index];
    vec3 normal = refract(normalize(rayHitPos[index] - rayPos[index]), rayHitNormal[index], matRefraction[shapeMat[shapeIndex]]);
    float eta = matRefraction[shapeMat[shapeIndex]];
    vec3 N = rayHitNormal[index];
    vec3 I = normalize(rayHitPos[index] - rayPos[index]);
    vec3 R;
    float k = 1.0 - eta * eta * (1.0 - dot(N, I) * dot(N, I));
    if (k < 0.0)
        R = normalize(rayHitPos[index] - rayPos[index]) - rayHitNormal[index] * 0.001;
    else
        R = eta * I - (eta * dot(N, I) + sqrt(k)) * N;
   
    ray(index, rayHitPos[index] + normalize(rayHitPos[index] - shapePos[shapeIndex]) * 0.001, R, REFRACT, OUTSIDE);
}

vec4 render(vec2 uv) {
    rayScreen(uv);
    
    traceOut(0,0);
    
    /*
    int count = 0;
    for(int i = 0; i < RAY_ITERATION + ZERO; i++)
    {
        int i1 = i * 2 + 1;
        int i2 = i * 2 + 2;
        
        rayInitialized[i1] = true;

        if(rayHitOrMiss[i] == HIT) 
        {

            int shapeIndex = rayHitShape[i];
            if(matReflectivity[shapeMat[shapeIndex]] > 0.)
            {
                reflectRay(i, i1);
                traceOut(i1, rayHitShape[i]);
            }
        }
        
        rayInitialized[i2] = false;
        if(rayHitOrMiss[i] == HIT)
        {
            int shapeIndex = rayHitShape[i];        
            if(matTransparency[shapeMat[shapeIndex]] > 0.)                          
            {
                refractRayIn(i,i2);             
                traceIn(i2);
                vec4 innerColor = rayInnerColor[i2];
                refractRayOut(i2);
                traceOut(i2,rayHitShape[i]);
                rayInnerColor[i2] = innerColor;
            }                                                    
        }
    }
    vec4 rayColors[RAY_ITERATION];
    
    for(int i = 0; i < RAY_ITERATION + ZERO; i++)
    {
        int index = RAY_ITERATION - 1 - i;
        int reflectIndex = index * 2 + 1;
        int refractIndex = index * 2 + 2;
        
        if(rayInitialized[index])
        {
            vec4 reflectColor = rayColor[reflectIndex];
            vec4 refractColor = rayColor[refractIndex];
            if(int(floor(log2(float(index+1)))) + 1 < MAX_BOUNCES)
            {
                reflectColor = rayColors[reflectIndex];
                refractColor = rayColors[refractIndex];
            }
            if(!rayInitialized[reflectIndex] && !rayInitialized[refractIndex])
            {

                rayColors[index] = rayColor[index];
            }
            else if(rayInitialized[reflectIndex] && !rayInitialized[refractIndex])
            {
                rayColors[index] = mix(rayColor[index], reflectColor, reflectColor.w);
                rayColors[index].w = rayColor[index].w;
            }
            else if(!rayInitialized[reflectIndex] && rayInitialized[refractIndex])
            {
                vec4 attenuatedColor = mix(rayInnerColor[refractIndex], refractColor, rayInnerColor[refractIndex].w);
                rayColors[index] = mix(refractColor, attenuatedColor, refractColor.w);
                rayColors[index].w = rayColor[index].w;
            }
            else if(rayInitialized[reflectIndex] && rayInitialized[refractIndex])
            {
                vec4 attenuatedColor = mix(rayInnerColor[refractIndex], refractColor, rayInnerColor[refractIndex].w);
                vec4 fromRefract = mix(rayColor[index], attenuatedColor, refractColor.w);
                vec4 fromReflect = mix(rayColor[index], reflectColor, reflectColor.w);
                rayColors[index] = mix(fromRefract, fromReflect, 0.5);
                rayColors[index].w = rayColor[index].w;
            }
        }
    }
    */

    //return rayColors[0];
    return rayColor[0];
}

vec2 normalizeScreenCoords(vec2 screenCoord)
{
    return (screenCoord.xy * 2. - iResolution.xy) / iResolution.x;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
  // Normalized pixel coordinates (from 0 to 1)
  vec2 uv = normalizeScreenCoords(fragCoord);

  initScene();
  
  lightPos[2] = vec3(4. * cos(iTime * 1.), 6.5, 4. * sin(iTime * 1.));
  camPos = vec3(8. * sin(2. * PI * iMouse.x / iResolution.x), 0.5 + (iMouse.y / iResolution.y) * 10., 8. * cos(2. * PI * iMouse.x / iResolution.x));

  fragColor = render(uv);

  if(override)
  {
      fragColor = overrideColor;
  }
}

void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}