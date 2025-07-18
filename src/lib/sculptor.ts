"use client";
import {
  SphereDims,
  BoxDims,
  RoundBoxDims,
  ConeDims,
  TorusDims,
  LinkDims,
  HexPrismDims,
  TriPrismDims,
  CylinderDims,
  RoundCylinderDims,
  CapsuleDims,
  CutConeDims,
  ShapeDims,
  ShapeType,
  SolidAngleDims,
  CutSphereDims,
  RoundConeDims,
  OctahedronDims,
} from "./datamanager";
import * as THREE from "three";
import Rand from "rand-seed";

let RAPIER: any = null;
let EventQueue: any = null;

const initRapier = async () => {
  if (typeof window !== "undefined" && !RAPIER) {
    const rapierModule = await import("@dimforge/rapier3d");
    RAPIER = rapierModule.default || rapierModule;
    EventQueue = rapierModule.EventQueue;
  }
  return RAPIER;
};
// Type definitions
export interface ShapeDefinition {
  type: ShapeType;
  dimensions: ShapeDims;
}

export interface SimulationConfig {
  shapes: ShapeDefinition[];
  radius: number;
  gravityStrength: number;
  friction: number;
  verticalSpread: number;
  verticalOffset: number;
  stepsPerIteration: number;
  timeStep: number;
  seed: string;
  maxInitialFrames: number;
  maxSubsequentFrames: number;
  maxAttempts: number;
  substeps?: number; // Number of physics substeps per iteration

  // NEW: Initial static shapes from previous simulation
  initialStaticShapes?: ShapeState[];

  // Overlap resolution settings
  enableOverlapResolution?: boolean; // Whether to resolve overlaps
  maxResolutionIterations?: number; // Max iterations for overlap resolution
  resolutionStep?: number; // How far to move per iteration (small increments)
  separationBuffer?: number; // Extra buffer distance when separating overlaps
  resolutionFramesPerStep?: number; // How many simulation frames between resolution steps (for visibility)
  settleFramesPerStep?: number; // How many frames to show settling physics
  addFromTop?: boolean; // Whether to add new shapes from the top
}

export interface ShapeState {
  type: ShapeType;
  dimensions: ShapeDims;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  angularVelocity: { x: number; y: number; z: number };
  sleeping: boolean;
  isStatic?: boolean; // NEW: Track if this shape is static
}

export interface SimulationResult {
  shapes: ShapeState[];
  frameCount: number;
  isComplete: boolean;
  completionReason?: "all_connected" | "max_frames" | "user_stopped";
  overlaps?: Array<{
    index1: number;
    index2: number;
    penetrationDepth: number;
  }>; // Information about overlapping shapes
  resolutionIterations?: number; // Number of iterations used to resolve overlaps
  resolutionState?: "idle" | "separating" | "settling"; // Current resolution state
  connectivityInfo?: any; // Debug info during settling

  // NEW: Spatial Y-coordinate information for the sculpture
  bottomY?: number; // Lowest Y coordinate of the entire sculpture
  middleY?: number; // Spatial middle Y coordinate (midpoint between absolute min and max)
  topY?: number; // Highest Y coordinate of the entire sculpture
  sculptureHeight?: number; // Total height of the sculpture (topY - bottomY)
}

function generateCutConePoints(
  bottomRadius: number,
  topRadius: number,
  halfHeight: number, // Now expects half-height like SDF
  segments = 16
): Float32Array {
  const vertices = [];
  // Bottom circle vertices (at y = -halfHeight)
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push(
      Math.cos(angle) * bottomRadius,
      -halfHeight, // Bottom at -h
      Math.sin(angle) * bottomRadius
    );
  }
  // Top circle vertices (at y = +halfHeight)
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    vertices.push(
      Math.cos(angle) * topRadius,
      halfHeight, // Top at +h
      Math.sin(angle) * topRadius
    );
  }
  return new Float32Array(vertices);
}

function generateTriPrismPoints(
  c_x: number, // Triangle scale parameter (NOT side length)
  c_y: number // Half-height of prism
): Float32Array {
  const points: number[] = [];

  // Triangle vertices based on SDF constraints:
  // max(q.z-c.y, max(q.x*0.866025+p.y*0.5, -p.y) - c.x*0.5)
  const sqrt3_2 = Math.sqrt(3) / 2; // 0.866025

  const tri = [
    [0, c_x], // Top vertex
    [-c_x * sqrt3_2, -c_x / 2], // Bottom left
    [c_x * sqrt3_2, -c_x / 2], // Bottom right
  ];

  // Extrude in Z (bottom and top faces)
  for (const z of [-c_y, c_y]) {
    for (const [x, y] of tri) {
      points.push(x, y, z);
    }
  }

  return new Float32Array(points);
}

function generateHexPrismPoints(
  apothem: number, // c.x in SDF - distance from center to edge
  halfHeight: number // c.y in SDF - half the height of the prism
): Float32Array {
  const points: number[] = [];

  // For a regular hexagon with apothem 'a', the radius (center to vertex) is a * 2/√3
  const radius = apothem * (2 / Math.sqrt(3));

  // Generate 6 vertices of the hexagon in XY plane
  const hexVertices: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3; // 60 degrees apart
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    hexVertices.push([x, y]);
  }

  // Create vertices for both the top and bottom faces
  // Bottom face (z = -halfHeight)
  for (const [x, y] of hexVertices) {
    points.push(x, y, -halfHeight);
  }

  // Top face (z = +halfHeight)
  for (const [x, y] of hexVertices) {
    points.push(x, y, halfHeight);
  }

  return new Float32Array(points);
}

function generateTorusPoints(
  R: number,
  r: number,
  segments = 16,
  sides = 8
): Float32Array {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    const cx = Math.cos(theta) * R;
    const cz = Math.sin(theta) * R;

    for (let j = 0; j < sides; j++) {
      const phi = (j / sides) * 2 * Math.PI;
      const x = cx + Math.cos(phi) * r * Math.cos(theta);
      const y = Math.sin(phi) * r;
      const z = cz + Math.cos(phi) * r * Math.sin(theta);
      points.push(x, y, z);
    }
  }
  return new Float32Array(points);
}

function generateLinkPoints(
  arcRadius: number, // r in SDF
  tubeRadius: number, // r2 in SDF
  verticalLength: number, // 2h in SDF
  arcSteps = 16,
  sides = 8
): Float32Array {
  const points: number[] = [];
  const h = verticalLength / 2;

  const path: [number, number][] = [];

  // Top arc (right to left), centered at Y=+h
  for (let i = 0; i <= arcSteps; i++) {
    const theta = Math.PI - (i / arcSteps) * Math.PI;
    path.push([
      arcRadius * Math.cos(theta), // X
      h + arcRadius * Math.sin(theta), // Y
    ]);
  }

  // Downward segment (right side)
  for (let i = 1; i < arcSteps; i++) {
    const t = i / arcSteps;
    path.push([
      arcRadius, // X
      h - 2 * h * t, // Y: from h to -h
    ]);
  }

  // Bottom arc (left to right), centered at Y=-h
  for (let i = 0; i <= arcSteps; i++) {
    const theta = (i / arcSteps) * Math.PI;
    path.push([
      arcRadius * Math.cos(theta), // X
      -h - arcRadius * Math.sin(theta), // Y  <-- Note the minus sign
    ]);
  }

  // Upward segment (left side)
  for (let i = 1; i < arcSteps; i++) {
    const t = i / arcSteps;
    path.push([
      -arcRadius, // X
      -h + 2 * h * t, // Y: from -h to h
    ]);
  }

  // Sweep cross-section (circle in XZ plane) along path
  for (const [px, py] of path) {
    for (let j = 0; j < sides; j++) {
      const phi = (j / sides) * 2 * Math.PI;
      const x = px + tubeRadius * Math.cos(phi);
      const y = py;
      const z = tubeRadius * Math.sin(phi);
      points.push(x, y, z);
    }
  }

  return new Float32Array(points);
}

function generateSolidAnglePoints(
  angleRad: number, // This should be the cone half-angle
  radius: number
): Float32Array {
  const vertices = [];

  // Add apex at origin
  vertices.push(0, 0, 0);

  const azimuthSegments = 6;
  const polarSegments = 3;

  for (let i = 0; i < azimuthSegments; i++) {
    const phi = (i / azimuthSegments) * 2 * Math.PI; // Around Y-axis

    for (let j = 1; j <= polarSegments; j++) {
      // Polar angle from +Y axis: 0 to angleRad (cone half-angle)
      const theta = (j / polarSegments) * angleRad;

      // Multiple radii for volume
      const radii = [radius * 0.5, radius];

      radii.forEach((r) => {
        vertices.push(
          r * Math.sin(theta) * Math.cos(phi), // x
          r * Math.cos(theta), // y (points along +Y when theta=0)
          r * Math.sin(theta) * Math.sin(phi) // z
        );
      });
    }
  }

  return new Float32Array(vertices);
}

function generateCutSpherePoints(
  r: number,
  h_normalized: number
): Float32Array {
  h_normalized = Math.max(-1, Math.min(1, h_normalized));
  const h: number = h_normalized * r;
  const vertices: number[] = [];
  const w: number = Math.sqrt(r * r - h * h);

  const azimuthSegments: number = 16;
  const polarSegments: number = 12;

  for (let i = 0; i < azimuthSegments; i++) {
    const phi: number = (i / azimuthSegments) * 2 * Math.PI;

    for (let j = 0; j < polarSegments; j++) {
      const theta: number = (j / (polarSegments - 1)) * Math.PI;
      const y: number = r * Math.cos(theta);

      // Keep points ABOVE the cutting plane
      if (y >= h) {
        const x: number = r * Math.sin(theta) * Math.cos(phi);
        const z: number = r * Math.sin(theta) * Math.sin(phi);
        vertices.push(x, y, z);
      }
    }
  }

  // Add flat cut surface points
  if (Math.abs(h) < r) {
    for (let i = 0; i < azimuthSegments; i++) {
      const phi: number = (i / azimuthSegments) * 2 * Math.PI;
      const x: number = w * Math.cos(phi);
      const z: number = w * Math.sin(phi);
      vertices.push(x, h, z);
    }
    vertices.push(0, h, 0);
  }

  return new Float32Array(vertices);
}

function generateRoundedConePoints(
  r: number, // Bottom radius
  r2: number, // Top radius
  h: number, // Core height (between sphere centers)
  azimuthSegments: number = 16,
  polarSegments: number = 8
): Float32Array {
  const vertices: number[] = [];

  // Bottom hemisphere (sphere of radius r at origin, keep y <= 0)
  for (let i = 0; i < azimuthSegments; i++) {
    const phi = (i / azimuthSegments) * 2 * Math.PI;

    for (let j = 0; j < polarSegments; j++) {
      const theta = (j / (polarSegments - 1)) * Math.PI;
      const y = r * Math.cos(theta);

      // Only keep bottom hemisphere points
      if (y <= 0) {
        const x = r * Math.sin(theta) * Math.cos(phi);
        const z = r * Math.sin(theta) * Math.sin(phi);
        vertices.push(x, y, z);
      }
    }
  }

  // Top hemisphere (sphere of radius r2 at (0,h,0), keep y >= h)
  for (let i = 0; i < azimuthSegments; i++) {
    const phi = (i / azimuthSegments) * 2 * Math.PI;

    for (let j = 0; j < polarSegments; j++) {
      const theta = (j / (polarSegments - 1)) * Math.PI;
      const y_local = r2 * Math.cos(theta);
      const y_world = h + y_local; // Translate to (0,h,0)

      // Only keep top hemisphere points
      if (y_world >= h) {
        const x = r2 * Math.sin(theta) * Math.cos(phi);
        const z = r2 * Math.sin(theta) * Math.sin(phi);
        vertices.push(x, y_world, z);
      }
    }
  }

  // Cone surface points between y=0 and y=h
  const heightSegments = 4;
  for (let i = 0; i < azimuthSegments; i++) {
    const phi = (i / azimuthSegments) * 2 * Math.PI;

    for (let j = 1; j < heightSegments; j++) {
      // Skip j=0 and j=heightSegments to avoid overlap
      const t = j / heightSegments;
      const y = t * h;
      const radius = r + (r2 - r) * t; // Linear interpolation

      const x = radius * Math.cos(phi);
      const z = radius * Math.sin(phi);
      vertices.push(x, y, z);
    }
  }

  // Add key points for robustness
  vertices.push(0, -r, 0); // Bottom pole
  vertices.push(0, h + r2, 0); // Top pole

  return new Float32Array(vertices);
}

function generateOctahedronPoints(r: number): Float32Array {
  // An octahedron has 6 vertices positioned along the coordinate axes
  // at distance r from the origin
  const vertices = [
    // Positive and negative X axis
    r,
    0,
    0,
    -r,
    0,
    0,

    // Positive and negative Y axis
    0,
    r,
    0,
    0,
    -r,
    0,

    // Positive and negative Z axis
    0,
    0,
    r,
    0,
    0,
    -r,
  ];

  return new Float32Array(vertices);
}

export class PhysicsSimulator {
  private world: any = null;
  private rigidBodies: any[] = [];
  private shapeDefinitions: ShapeDefinition[] = [];
  private config: SimulationConfig;
  private frameCount: number = 0;
  private maxInitialFrames: number = 300;
  private maxSubsequentFrames: number = 30;
  private attempts: number = 0;
  private maxAttempts: number = 10;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private rand: Rand;
  private eventQueue?: typeof EventQueue;
  private contactGraph: Map<number, Set<number>>;

  // NEW: Track static vs dynamic bodies
  private staticBodyCount: number = 0;
  private staticBodyHandles: Set<number> = new Set();

  // Overlap resolution state
  private resolutionState: "idle" | "separating" | "settling" = "idle";
  private resolutionIteration: number = 0;
  private resolutionFrameCounter: number = 0;
  private settleFrameCounter: number = 0;
  private pendingOverlaps: Array<{
    index1: number;
    index2: number;
    penetrationDepth: number;
  }> = [];

  constructor(config: SimulationConfig) {
    this.config = {
      substeps: 1, // Default to 1 substep (original behavior)
      enableOverlapResolution: true, // Enable overlap resolution by default
      maxResolutionIterations: 10, // More iterations for smoother movement
      resolutionStep: 0.003, // Small steps for smooth movement
      separationBuffer: 0.01, // Smaller buffer to reduce separation distance
      resolutionFramesPerStep: 1, // Process every frame for smoothness
      settleFramesPerStep: 1, // Faster settling physics processing
      initialStaticShapes: [], // Default to no static shapes
      addFromTop: false,
      ...config,
    };
    this.rand = new Rand(config.seed);
    this.maxInitialFrames = config.maxInitialFrames;
    this.maxSubsequentFrames = config.maxSubsequentFrames;
    this.contactGraph = new Map();
  }

  /**
   * Create collider descriptor for a given shape type and dimensions
   */
  private createColliderDesc(shapeType: ShapeType, dimensions: ShapeDims): any {
    switch (shapeType) {
      case ShapeType.BOX:
        const boxDims: BoxDims = dimensions as BoxDims;
        return RAPIER.ColliderDesc.cuboid(
          boxDims.a.x,
          boxDims.a.y,
          boxDims.a.z
        );
      case ShapeType.ROUND_BOX:
        const roundBoxDims: RoundBoxDims = dimensions as RoundBoxDims;
        return RAPIER.ColliderDesc.roundCuboid(
          roundBoxDims.a.x - roundBoxDims.r,
          roundBoxDims.a.y - roundBoxDims.r,
          roundBoxDims.a.z - roundBoxDims.r,
          roundBoxDims.r
        );
      case ShapeType.SPHERE:
        const sphereDims: SphereDims = dimensions as SphereDims;
        return RAPIER.ColliderDesc.ball(sphereDims.r);
      case ShapeType.CYLINDER:
        const cylinderDims: CylinderDims = dimensions as CylinderDims;
        return RAPIER.ColliderDesc.cylinder(cylinderDims.h, cylinderDims.r);
      case ShapeType.ROUND_CYLINDER:
        const roundCylinderDims: RoundCylinderDims =
          dimensions as RoundCylinderDims;
        return RAPIER.ColliderDesc.roundCylinder(
          roundCylinderDims.h,
          roundCylinderDims.r,
          roundCylinderDims.r2
        );
      case ShapeType.CONE:
        const coneDims: ConeDims = dimensions as ConeDims;
        return RAPIER.ColliderDesc.cone(
          coneDims.h / 2,
          coneDims.h * (coneDims.c.x / coneDims.c.y)
        );
      case ShapeType.TORUS:
        const torusDims: TorusDims = dimensions as TorusDims;
        const torusPoints = generateTorusPoints(torusDims.r1, torusDims.r2);
        return RAPIER.ColliderDesc.convexHull(torusPoints);
      case ShapeType.LINK:
        const linkDims: LinkDims = dimensions as LinkDims;
        const linkPoints = generateLinkPoints(
          linkDims.r1,
          linkDims.r2,
          linkDims.h * 2
        );
        return RAPIER.ColliderDesc.convexHull(linkPoints);
      case ShapeType.HEX_PRISM:
        const hexPrismDims: HexPrismDims = dimensions as HexPrismDims;
        const hexPrismPoints = generateHexPrismPoints(
          hexPrismDims.c.x,
          hexPrismDims.c.y
        );
        return RAPIER.ColliderDesc.convexHull(hexPrismPoints);
      case ShapeType.TRI_PRISM:
        const triPrismDims: TriPrismDims = dimensions as TriPrismDims;
        const triPrismPoints = generateTriPrismPoints(
          triPrismDims.c.x,
          triPrismDims.c.y
        );
        return RAPIER.ColliderDesc.convexHull(triPrismPoints);
      case ShapeType.CAPSULE:
        const capsuleDims: CapsuleDims = dimensions as CapsuleDims;
        return RAPIER.ColliderDesc.capsule(capsuleDims.h / 2, capsuleDims.r);
      case ShapeType.CUT_CONE:
        const cutConeDims: CutConeDims = dimensions as CutConeDims;
        const cutConePoints = generateCutConePoints(
          cutConeDims.r,
          cutConeDims.r2,
          cutConeDims.h
        );
        return RAPIER.ColliderDesc.convexHull(cutConePoints);
      case ShapeType.SOLID_ANGLE:
        const solidAngleDims: SolidAngleDims = dimensions as SolidAngleDims;
        const solidAnglePoints = generateSolidAnglePoints(
          solidAngleDims.h / 2,
          solidAngleDims.r
        );
        return RAPIER.ColliderDesc.convexHull(solidAnglePoints);
      case ShapeType.CUT_SPHERE:
        const cutSphereDims: CutSphereDims = dimensions as CutSphereDims;
        const cutSpherePoints = generateCutSpherePoints(
          cutSphereDims.r,
          cutSphereDims.h
        );
        return RAPIER.ColliderDesc.convexHull(cutSpherePoints);
      case ShapeType.ROUND_CONE:
        const roundConeDims: RoundConeDims = dimensions as RoundConeDims;
        const roundConePoints = generateRoundedConePoints(
          roundConeDims.r1,
          roundConeDims.r2,
          roundConeDims.h
        );
        return RAPIER.ColliderDesc.convexHull(roundConePoints);
      case ShapeType.OCTAHEDRON:
        const octahedronDims: OctahedronDims = dimensions as OctahedronDims;
        const octahedronPoints = generateOctahedronPoints(octahedronDims.r);
        return RAPIER.ColliderDesc.convexHull(octahedronPoints);

      default:
        return RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5);
    }
  }

  /**
   * Get shape dimensions from ShapeState for recreating static shapes
   * This is a fallback method for backward compatibility when dimensions aren't stored
   */
  private getShapeDimensionsFromType(shapeType: ShapeType): Partial<ShapeDims> {
    // This provides default dimensions for each type as a fallback
    // In practice, dimensions should be stored in ShapeState.dimensions
    switch (shapeType) {
      case ShapeType.SPHERE:
        return { r: 0.5 } as SphereDims;
      case ShapeType.BOX:
        return { a: { x: 0.5, y: 0.5, z: 0.5 } } as BoxDims;
      case ShapeType.ROUND_BOX:
        return { a: { x: 0.5, y: 0.5, z: 0.5 }, r: 0.1 } as RoundBoxDims;
      case ShapeType.CYLINDER:
        return { r: 0.5, h: 1.0 } as CylinderDims;
      case ShapeType.ROUND_CYLINDER:
        return { r: 0.5, h: 1.0, r2: 0.1 } as RoundCylinderDims;
      case ShapeType.CONE:
        return { h: 1.0, c: { x: 0.5, y: 1.0 } } as ConeDims;
      case ShapeType.TORUS:
        return { r1: 0.5, r2: 0.2 } as TorusDims;
      case ShapeType.LINK:
        return { r1: 0.5, r2: 0.2, h: 1.0 } as LinkDims;
      case ShapeType.HEX_PRISM:
        return { c: { x: 0.5, y: 1.0 }, r: 0.5, h: 1.0 } as HexPrismDims;
      case ShapeType.TRI_PRISM:
        return { c: { x: 0.5, y: 1.0 }, r: 0.5, h: 1.0 } as TriPrismDims;
      case ShapeType.CAPSULE:
        return { r: 0.5, h: 1.0 } as CapsuleDims;
      case ShapeType.CUT_CONE:
        return { r: 0.5, r2: 0.3, h: 1.0 } as CutConeDims;
      case ShapeType.SOLID_ANGLE:
        return { r: 0.5, h: 1.0 } as SolidAngleDims;
      case ShapeType.CUT_SPHERE:
        return { r: 0.5, h: 0.0 } as CutSphereDims;
      case ShapeType.ROUND_CONE:
        return { r1: 0.5, r2: 0.3, h: 1.0 } as RoundConeDims;
      case ShapeType.OCTAHEDRON:
        return { r: 0.5 } as OctahedronDims;
      default:
        return { r: 0.5 } as SphereDims;
    }
  }

  private getShapeLocalExtents(
    shapeType: ShapeType,
    dimensions: ShapeDims
  ): Array<{ x: number; y: number; z: number }> {
    const points: Array<{ x: number; y: number; z: number }> = [];

    switch (shapeType) {
      case ShapeType.SPHERE:
        const sphereDims = dimensions as SphereDims;
        // Sample points around sphere surface
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          for (let phi = 0; phi < Math.PI; phi += Math.PI / 4) {
            points.push({
              x: sphereDims.r * Math.sin(phi) * Math.cos(theta),
              y: sphereDims.r * Math.cos(phi),
              z: sphereDims.r * Math.sin(phi) * Math.sin(theta),
            });
          }
        }
        break;

      case ShapeType.BOX:
        const boxDims = dimensions as BoxDims;
        // All 8 corners of the box
        for (const x of [-boxDims.a.x, boxDims.a.x]) {
          for (const y of [-boxDims.a.y, boxDims.a.y]) {
            for (const z of [-boxDims.a.z, boxDims.a.z]) {
              points.push({ x, y, z });
            }
          }
        }
        break;

      case ShapeType.ROUND_BOX:
        const roundBoxDims = dimensions as RoundBoxDims;
        // Box corners plus rounding radius
        for (const x of [
          -roundBoxDims.a.x - roundBoxDims.r,
          roundBoxDims.a.x + roundBoxDims.r,
        ]) {
          for (const y of [
            -roundBoxDims.a.y - roundBoxDims.r,
            roundBoxDims.a.y + roundBoxDims.r,
          ]) {
            for (const z of [
              -roundBoxDims.a.z - roundBoxDims.r,
              roundBoxDims.a.z + roundBoxDims.r,
            ]) {
              points.push({ x, y, z });
            }
          }
        }
        break;

      case ShapeType.CYLINDER:
        const cylinderDims = dimensions as CylinderDims;
        // Top and bottom circles plus side points
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          const x = cylinderDims.r * Math.cos(theta);
          const z = cylinderDims.r * Math.sin(theta);
          points.push({ x, y: cylinderDims.h, z }); // Top circle
          points.push({ x, y: -cylinderDims.h, z }); // Bottom circle
        }
        break;

      case ShapeType.ROUND_CYLINDER:
        const roundCylinderDims = dimensions as RoundCylinderDims;
        // Cylinder with rounded edges
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          const x =
            (roundCylinderDims.r + roundCylinderDims.r2) * Math.cos(theta);
          const z =
            (roundCylinderDims.r + roundCylinderDims.r2) * Math.sin(theta);
          points.push({ x, y: roundCylinderDims.h + roundCylinderDims.r2, z }); // Top
          points.push({ x, y: -roundCylinderDims.h - roundCylinderDims.r2, z }); // Bottom
        }
        break;

      case ShapeType.CONE:
        const coneDims = dimensions as ConeDims;
        const coneRadius = coneDims.h * (coneDims.c.x / coneDims.c.y);
        // Apex and base circle
        points.push({ x: 0, y: coneDims.h / 2, z: 0 }); // Apex
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          points.push({
            x: coneRadius * Math.cos(theta),
            y: -coneDims.h / 2,
            z: coneRadius * Math.sin(theta),
          });
        }
        break;

      case ShapeType.TORUS:
        const torusDims = dimensions as TorusDims;
        // Sample points around torus surface
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 2) {
          for (let phi = 0; phi < Math.PI * 2; phi += Math.PI / 2) {
            const x =
              (torusDims.r1 + torusDims.r2 * Math.cos(phi)) * Math.cos(theta);
            const y = torusDims.r2 * Math.sin(phi);
            const z =
              (torusDims.r1 + torusDims.r2 * Math.cos(phi)) * Math.sin(theta);
            points.push({ x, y, z });
          }
        }
        break;

      case ShapeType.LINK:
        const linkDims = dimensions as LinkDims;
        // Sample key points along the link path
        const h = linkDims.h / 2;
        // Top arc
        for (let i = 0; i <= 4; i++) {
          const theta = Math.PI - (i / 4) * Math.PI;
          points.push({
            x: (linkDims.r1 + linkDims.r2) * Math.cos(theta),
            y: h + (linkDims.r1 + linkDims.r2) * Math.sin(theta),
            z: 0,
          });
        }
        // Bottom arc
        for (let i = 0; i <= 4; i++) {
          const theta = (i / 4) * Math.PI;
          points.push({
            x: (linkDims.r1 + linkDims.r2) * Math.cos(theta),
            y: -h - (linkDims.r1 + linkDims.r2) * Math.sin(theta),
            z: 0,
          });
        }
        break;

      case ShapeType.HEX_PRISM:
        const hexPrismDims = dimensions as HexPrismDims;
        const hexRadius = hexPrismDims.c.x * (2 / Math.sqrt(3));
        // Hexagon vertices at top and bottom
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const x = hexRadius * Math.cos(angle);
          const z = hexRadius * Math.sin(angle);
          points.push({ x, y: hexPrismDims.c.y, z }); // Top
          points.push({ x, y: -hexPrismDims.c.y, z }); // Bottom
        }
        break;

      case ShapeType.TRI_PRISM:
        const triPrismDims = dimensions as TriPrismDims;
        const sqrt3_2 = Math.sqrt(3) / 2;
        // Triangle vertices at top and bottom
        const triVertices = [
          [0, triPrismDims.c.x],
          [-triPrismDims.c.x * sqrt3_2, -triPrismDims.c.x / 2],
          [triPrismDims.c.x * sqrt3_2, -triPrismDims.c.x / 2],
        ];
        triVertices.forEach(([x, z]) => {
          points.push({ x, y: triPrismDims.c.y, z }); // Top
          points.push({ x, y: -triPrismDims.c.y, z }); // Bottom
        });
        break;

      case ShapeType.CAPSULE:
        const capsuleDims = dimensions as CapsuleDims;
        // Cylinder body + hemisphere caps
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          const x = capsuleDims.r * Math.cos(theta);
          const z = capsuleDims.r * Math.sin(theta);
          // Cylinder ends
          points.push({ x, y: capsuleDims.h / 2, z });
          points.push({ x, y: -capsuleDims.h / 2, z });
          // Hemisphere tops/bottoms
          points.push({ x, y: capsuleDims.h / 2 + capsuleDims.r, z });
          points.push({ x, y: -capsuleDims.h / 2 - capsuleDims.r, z });
        }
        break;

      case ShapeType.CUT_CONE:
        const cutConeDims = dimensions as CutConeDims;
        // Top circle and bottom circle
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          points.push({
            x: cutConeDims.r2 * Math.cos(theta),
            y: cutConeDims.h,
            z: cutConeDims.r2 * Math.sin(theta),
          });
          points.push({
            x: cutConeDims.r * Math.cos(theta),
            y: -cutConeDims.h,
            z: cutConeDims.r * Math.sin(theta),
          });
        }
        break;

      case ShapeType.SOLID_ANGLE:
        const solidAngleDims = dimensions as SolidAngleDims;
        // Apex and surface points
        points.push({ x: 0, y: 0, z: 0 }); // Apex
        const angleRad = solidAngleDims.h / 2;
        for (let i = 0; i < 6; i++) {
          const phi = (i / 6) * 2 * Math.PI;
          points.push({
            x: solidAngleDims.r * Math.sin(angleRad) * Math.cos(phi),
            y: solidAngleDims.r * Math.cos(angleRad),
            z: solidAngleDims.r * Math.sin(angleRad) * Math.sin(phi),
          });
        }
        break;

      case ShapeType.CUT_SPHERE:
        const cutSphereDims = dimensions as CutSphereDims;
        const cutHeight = cutSphereDims.h * cutSphereDims.r;
        // Sample sphere surface points above/below cut
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          for (let phi = 0; phi < Math.PI; phi += Math.PI / 8) {
            const y = cutSphereDims.r * Math.cos(phi);
            if (y >= cutHeight) {
              // Only points above cut
              points.push({
                x: cutSphereDims.r * Math.sin(phi) * Math.cos(theta),
                y: y,
                z: cutSphereDims.r * Math.sin(phi) * Math.sin(theta),
              });
            }
          }
        }
        break;

      case ShapeType.ROUND_CONE:
        const roundConeDims = dimensions as RoundConeDims;
        // Bottom hemisphere, top hemisphere, and cone surface
        for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 4) {
          // Bottom hemisphere
          for (let phi = Math.PI / 2; phi <= Math.PI; phi += Math.PI / 8) {
            points.push({
              x: roundConeDims.r1 * Math.sin(phi) * Math.cos(theta),
              y: roundConeDims.r1 * Math.cos(phi),
              z: roundConeDims.r1 * Math.sin(phi) * Math.sin(theta),
            });
          }
          // Top hemisphere
          for (let phi = 0; phi <= Math.PI / 2; phi += Math.PI / 8) {
            points.push({
              x: roundConeDims.r2 * Math.sin(phi) * Math.cos(theta),
              y: roundConeDims.h + roundConeDims.r2 * Math.cos(phi),
              z: roundConeDims.r2 * Math.sin(phi) * Math.sin(theta),
            });
          }
        }
        break;

      case ShapeType.OCTAHEDRON:
        const octahedronDims = dimensions as OctahedronDims;
        // 6 vertices of octahedron
        points.push(
          { x: octahedronDims.r, y: 0, z: 0 },
          { x: -octahedronDims.r, y: 0, z: 0 },
          { x: 0, y: octahedronDims.r, z: 0 },
          { x: 0, y: -octahedronDims.r, z: 0 },
          { x: 0, y: 0, z: octahedronDims.r },
          { x: 0, y: 0, z: -octahedronDims.r }
        );
        break;

      default:
        // Fallback for unknown shapes - simple cube
        for (const x of [-0.5, 0.5]) {
          for (const y of [-0.5, 0.5]) {
            for (const z of [-0.5, 0.5]) {
              points.push({ x, y, z });
            }
          }
        }
        break;
    }

    return points;
  }

  private getShapeSpatialExtents(shape: ShapeState): {
    minY: number;
    maxY: number;
  } {
    const pos = shape.position;

    // Create rotation matrix from euler angles
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(shape.rotation.x, shape.rotation.y, shape.rotation.z)
    );

    // Get the key vertices/extents for each shape type in local coordinates
    const localExtents = this.getShapeLocalExtents(
      shape.type,
      shape.dimensions
    );

    // Transform all key points by rotation and find min/max Y
    let minY = Infinity;
    let maxY = -Infinity;

    localExtents.forEach((point) => {
      // Apply rotation to the local point
      const rotatedPoint = new THREE.Vector3(
        point.x,
        point.y,
        point.z
      ).applyMatrix4(rotationMatrix);

      // Add the shape's world position
      const worldY = pos.y + rotatedPoint.y;

      minY = Math.min(minY, worldY);
      maxY = Math.max(maxY, worldY);
    });

    return { minY, maxY };
  }

  private calculateSpatialBounds(shapes: ShapeState[]): {
    bottomY: number;
    middleY: number;
    topY: number;
    sculptureHeight: number;
  } {
    if (shapes.length === 0) {
      return { bottomY: 0, middleY: 0, topY: 0, sculptureHeight: 0 };
    }

    let overallMinY = Infinity;
    let overallMaxY = -Infinity;

    // Calculate the actual spatial extents of each shape
    shapes.forEach((shape) => {
      const extents = this.getShapeSpatialExtents(shape);
      overallMinY = Math.min(overallMinY, extents.minY);
      overallMaxY = Math.max(overallMaxY, extents.maxY);
    });

    const middleY = (overallMinY + overallMaxY) / 2;
    const sculptureHeight = overallMaxY - overallMinY;

    return {
      bottomY: overallMinY,
      middleY: middleY,
      topY: overallMaxY,
      sculptureHeight: sculptureHeight,
    };
  }

  /**
   * Initialize the physics simulation
   */
  async initialize(): Promise<void> {
    await initRapier();

    if (!RAPIER) {
      throw new Error("Failed to initialize Rapier physics engine");
    }

    this.eventQueue = new EventQueue(true);
    // Create physics world
    this.world = new RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
    this.rigidBodies = [];
    this.shapeDefinitions = [...this.config.shapes];
    this.frameCount = 0;
    this.isRunning = false;
    this.staticBodyCount = 0;
    this.staticBodyHandles.clear();
    this.attempts = 0;
    this.frameCount = 0;

    // STEP 1: Create static bodies from initial static shapes
    if (
      this.config.initialStaticShapes &&
      this.config.initialStaticShapes.length > 0
    ) {
      for (const staticShape of this.config.initialStaticShapes) {
        // Use the stored dimensions from the static shape, or fall back to type-based defaults
        const dimensions =
          staticShape.dimensions ||
          this.getShapeDimensionsFromType(staticShape.type);
        const colliderDesc = this.createColliderDesc(
          staticShape.type,
          dimensions
        );

        // Create static rigid body with exact position and rotation
        const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
          staticShape.position.x,
          staticShape.position.y,
          staticShape.position.z
        );

        // Set rotation from euler angles
        const q = new THREE.Quaternion();
        q.setFromEuler(
          new THREE.Euler(
            staticShape.rotation.x,
            staticShape.rotation.y,
            staticShape.rotation.z
          )
        );
        rigidBodyDesc.setRotation(q);

        const rigidBody = this.world.createRigidBody(rigidBodyDesc);

        // Create collider
        colliderDesc.setFriction(this.config.friction);
        colliderDesc.setRestitution(0.0);
        colliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);

        const collider = this.world.createCollider(colliderDesc, rigidBody);
        collider.setContactForceEventThreshold(0);

        this.rigidBodies.push(rigidBody);
        this.staticBodyHandles.add(rigidBody.handle);
        this.staticBodyCount++;
      }
    }

    // STEP 2: Create dynamic physics bodies for new shapes
    const placedShapes: Array<{
      position: [number, number, number];
      radius: number;
    }> = [];

    const angleOffset = this.rand.next() * Math.PI * 2;
    for (let i = 0; i < this.config.shapes.length; i++) {
      const shapeConfig = this.config.shapes[i];
      const baseAngle =
        angleOffset + (i / this.config.shapes.length) * Math.PI * 2;

      // Create collider based on shape type
      const colliderDesc = this.createColliderDesc(
        shapeConfig.type,
        shapeConfig.dimensions
      );

      // Calculate position around circle
      const position = this.findValidPosition(
        shapeConfig.type,
        shapeConfig.dimensions,
        placedShapes,
        baseAngle,
        !!this.config.addFromTop
      );

      const radius = this.config.radius;
      placedShapes.push({ position, radius });

      // Create dynamic rigid body
      const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(
        position[0],
        position[1],
        position[2]
      );
      const q = new THREE.Quaternion();
      q.setFromEuler(
        new THREE.Euler(
          this.rand.next() * Math.PI,
          this.rand.next() * Math.PI,
          this.rand.next() * Math.PI
        )
      );
      rigidBodyDesc.setRotation(q);
      rigidBodyDesc.mass = 0.001;
      rigidBodyDesc.ccdEnabled = true;
      const rigidBody = this.world.createRigidBody(rigidBodyDesc);

      // Create collider with collision margin to prevent penetration
      colliderDesc.setFriction(this.config.friction);
      colliderDesc.setRestitution(0.0);
      colliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      colliderDesc.ccdEnabled = true;

      const collider = this.world.createCollider(colliderDesc, rigidBody);
      collider.setContactForceEventThreshold(0);

      // Set physics properties
      rigidBody.setLinearDamping(1.0);
      rigidBody.setAngularDamping(10.0);
      rigidBody.ccdEnabled = true;

      this.rigidBodies.push(rigidBody);
    }

    this.isInitialized = true;
  }

  /**
   * Check if a body is static based on its handle
   */
  private isBodyStatic(body: any): boolean {
    return this.staticBodyHandles.has(body.handle);
  }

  /**
   * Check if all dynamic bodies are connected to the static structure
   * For simulations with static bodies: all dynamic bodies must be reachable from static bodies
   * For simulations without static bodies: all dynamic bodies must be connected to each other
   */
  areAllBodiesConnected() {
    // Initialize graph with ALL bodies (both static and dynamic)
    this.contactGraph.clear();
    this.world.bodies.forEach((body: any) => {
      this.contactGraph.set(body.handle, new Set());
    });

    // Build connectivity graph from contact force events (proper touching)
    this.eventQueue!.drainContactForceEvents((event: any) => {
      const collider1 = this.world.getCollider(event.collider1());
      const collider2 = this.world.getCollider(event.collider2());
      const body1 = collider1?.parent();
      const body2 = collider2?.parent();

      if (!body1 || !body2) return;
      if (
        !this.contactGraph.has(body1.handle) ||
        !this.contactGraph.has(body2.handle)
      )
        return;

      // Track ALL connections (static-static, static-dynamic, dynamic-dynamic)
      this.contactGraph.get(body1.handle)!.add(body2.handle);
      this.contactGraph.get(body2.handle)!.add(body1.handle);
    });

    // Also add overlapping bodies as connected
    const overlaps = this.detectOverlaps();
    overlaps.forEach((overlap) => {
      const body1 = this.rigidBodies[overlap.index1];
      const body2 = this.rigidBodies[overlap.index2];

      if (!body1 || !body2) return;
      if (
        !this.contactGraph.has(body1.handle) ||
        !this.contactGraph.has(body2.handle)
      )
        return;

      // Add ALL overlap connections to the graph
      this.contactGraph.get(body1.handle)!.add(body2.handle);
      this.contactGraph.get(body2.handle)!.add(body1.handle);
    });

    // Get all dynamic body handles
    const dynamicHandles: number[] = [];
    this.world.bodies.forEach((body: any) => {
      if (body.isDynamic()) {
        dynamicHandles.push(body.handle);
      }
    });

    // If no dynamic bodies, consider it connected
    if (dynamicHandles.length === 0) return true;

    // If we have static bodies, check that all dynamic bodies are connected to static structure
    if (this.staticBodyCount > 0) {
      // Start BFS from all static bodies
      const visited = new Set<number>();
      const queue: number[] = [];

      // Add all static body handles to the queue
      this.staticBodyHandles.forEach((handle) => {
        if (this.contactGraph.has(handle)) {
          queue.push(handle);
          visited.add(handle);
        }
      });

      // BFS to find all bodies reachable from static bodies
      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = this.contactGraph.get(current);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      // Check that all dynamic bodies are reachable from static bodies
      return dynamicHandles.every((handle) => visited.has(handle));
    } else {
      // No static bodies - use original logic: all dynamic bodies must be connected to each other
      if (dynamicHandles.length <= 1) return true;

      const visited = new Set<number>();
      const queue = [dynamicHandles[0]];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (!visited.has(current)) {
          visited.add(current);
          const neighbors = this.contactGraph.get(current);
          if (neighbors) {
            for (const neighbor of neighbors) {
              // Only follow connections to other dynamic bodies
              if (dynamicHandles.includes(neighbor)) {
                queue.push(neighbor);
              }
            }
          }
        }
      }

      return visited.size === dynamicHandles.length;
    }
  }

  /**
   * Detect overlapping rigid bodies using Rapier's collision detection
   */
  private detectOverlaps(): Array<{
    index1: number;
    index2: number;
    penetrationDepth: number;
  }> {
    const overlaps: {
      index1: number;
      index2: number;
      penetrationDepth: number;
    }[] = [];

    for (let i = 0; i < this.rigidBodies.length; i++) {
      for (let j = i + 1; j < this.rigidBodies.length; j++) {
        const body1 = this.rigidBodies[i];
        const body2 = this.rigidBodies[j];

        if (!body1 || !body2) continue;

        const collider1 = body1.collider();
        const collider2 = body2.collider();

        if (!collider1 || !collider2) continue;

        // Use Rapier's contact detection with callback
        this.world.contactPair(collider1, collider2, (manifold: any) => {
          if (manifold) {
            // Check all contact points for penetration
            for (let k = 0; k < manifold.numContacts(); k++) {
              const contactDist = manifold.contactDist(k);

              // Negative distance indicates penetration/overlap
              if (contactDist < -0.0001) {
                // Small threshold to ignore floating point errors
                overlaps.push({
                  index1: i,
                  index2: j,
                  penetrationDepth: -contactDist,
                });
                break; // Only report one overlap per pair
              }
            }
          }
        });
      }
    }

    return overlaps;
  }

  /**
   * Calculate distance from y-axis (center line)
   */
  private getDistanceFromYAxis(body: any): number {
    const pos = body.translation();
    return Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  }

  /**
   * Get detailed connectivity information for debugging
   */
  getConnectivityInfo(): {
    totalBodies: number;
    staticBodies: number;
    dynamicBodies: number;
    connectedDynamicBodies: number;
    disconnectedDynamicBodies: number[];
    isFullyConnected: boolean;
    overlappingPairs: number;
    contactPairs: number;
    connectivityType: "static_anchored" | "peer_to_peer";
  } {
    // Initialize graph with ALL bodies
    this.contactGraph.clear();
    this.world.bodies.forEach((body: any) => {
      this.contactGraph.set(body.handle, new Set());
    });

    // Count contact pairs
    let contactPairs = 0;
    this.eventQueue!.drainContactForceEvents((event: any) => {
      const collider1 = this.world.getCollider(event.collider1());
      const collider2 = this.world.getCollider(event.collider2());
      const body1 = collider1?.parent();
      const body2 = collider2?.parent();

      if (!body1 || !body2) return;
      if (
        !this.contactGraph.has(body1.handle) ||
        !this.contactGraph.has(body2.handle)
      )
        return;

      this.contactGraph.get(body1.handle)!.add(body2.handle);
      this.contactGraph.get(body2.handle)!.add(body1.handle);
      contactPairs++;
    });

    // Count overlapping pairs and add to graph
    const overlaps = this.detectOverlaps();
    overlaps.forEach((overlap) => {
      const body1 = this.rigidBodies[overlap.index1];
      const body2 = this.rigidBodies[overlap.index2];

      if (!body1 || !body2) return;
      if (
        !this.contactGraph.has(body1.handle) ||
        !this.contactGraph.has(body2.handle)
      )
        return;

      this.contactGraph.get(body1.handle)!.add(body2.handle);
      this.contactGraph.get(body2.handle)!.add(body1.handle);
    });

    // Get dynamic body handles
    const dynamicHandles: number[] = [];
    this.world.bodies.forEach((body: any) => {
      if (body.isDynamic()) {
        dynamicHandles.push(body.handle);
      }
    });

    const totalDynamicBodies = dynamicHandles.length;
    const connectivityType =
      this.staticBodyCount > 0 ? "static_anchored" : "peer_to_peer";

    if (totalDynamicBodies === 0) {
      return {
        totalBodies: this.rigidBodies.length,
        staticBodies: this.staticBodyCount,
        dynamicBodies: 0,
        connectedDynamicBodies: 0,
        disconnectedDynamicBodies: [],
        isFullyConnected: true,
        overlappingPairs: overlaps.length,
        contactPairs,
        connectivityType,
      };
    }

    let connectedDynamicBodies = 0;
    let disconnectedDynamicBodies: number[] = [];
    let isFullyConnected = false;

    if (this.staticBodyCount > 0) {
      // Static-anchored mode: check reachability from static bodies
      const visited = new Set<number>();
      const queue: number[] = [];

      // Start BFS from all static bodies
      this.staticBodyHandles.forEach((handle) => {
        if (this.contactGraph.has(handle)) {
          queue.push(handle);
          visited.add(handle);
        }
      });

      // BFS to find all reachable bodies
      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = this.contactGraph.get(current);
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      // Count connected dynamic bodies
      dynamicHandles.forEach((handle) => {
        if (visited.has(handle)) {
          connectedDynamicBodies++;
        } else {
          disconnectedDynamicBodies.push(handle);
        }
      });

      isFullyConnected = connectedDynamicBodies === totalDynamicBodies;
    } else {
      // Peer-to-peer mode: check if all dynamic bodies are connected to each other
      if (totalDynamicBodies <= 1) {
        connectedDynamicBodies = totalDynamicBodies;
        isFullyConnected = true;
      } else {
        const visited = new Set<number>();
        const queue = [dynamicHandles[0]];

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (!visited.has(current)) {
            visited.add(current);
            const neighbors = this.contactGraph.get(current);
            if (neighbors) {
              for (const neighbor of neighbors) {
                if (dynamicHandles.includes(neighbor)) {
                  queue.push(neighbor);
                }
              }
            }
          }
        }

        connectedDynamicBodies = visited.size;
        disconnectedDynamicBodies = dynamicHandles.filter(
          (handle) => !visited.has(handle)
        );
        isFullyConnected = connectedDynamicBodies === totalDynamicBodies;
      }
    }

    return {
      totalBodies: this.rigidBodies.length,
      staticBodies: this.staticBodyCount,
      dynamicBodies: totalDynamicBodies,
      connectedDynamicBodies,
      disconnectedDynamicBodies,
      isFullyConnected,
      overlappingPairs: overlaps.length,
      contactPairs,
      connectivityType,
    };
  }

  /**
   * Calculate optimal separation direction based on contact normals and penetration depths
   */
  private calculateSeparationDirection(
    bodyIndex: number
  ): { x: number; y: number; z: number } | null {
    const body = this.rigidBodies[bodyIndex];
    if (!body) return null;

    const totalWeightedNormal = { x: 0, y: 0, z: 0 };
    let totalWeight = 0;

    // Check this body against all other bodies for contacts
    for (let i = 0; i < this.rigidBodies.length; i++) {
      if (i === bodyIndex) continue;

      const otherBody = this.rigidBodies[i];
      if (!otherBody) continue;

      const collider1 = body.collider();
      const collider2 = otherBody.collider();
      if (!collider1 || !collider2) continue;

      // Use Rapier's contact detection to get detailed contact info
      this.world.contactPair(collider1, collider2, (manifold: any) => {
        if (manifold) {
          // Get the contact normal (points from body1 to body2)
          const normal = manifold.normal();

          // Check all contact points for penetration
          for (let k = 0; k < manifold.numContacts(); k++) {
            const contactDist = manifold.contactDist(k);

            // Negative distance indicates penetration/overlap
            if (contactDist < -0.0001) {
              const penetrationDepth = -contactDist;

              // Normal points from our body to the other body, so we want to move opposite
              const separationNormal = {
                x: -normal.x,
                y: 0, // Don't separate vertically
                z: -normal.z,
              };

              // Weight by penetration depth - deeper penetrations have more influence
              totalWeightedNormal.x += separationNormal.x * penetrationDepth;
              totalWeightedNormal.y += separationNormal.y * penetrationDepth;
              totalWeightedNormal.z += separationNormal.z * penetrationDepth;
              totalWeight += penetrationDepth;
            }
          }
        }
      });
    }

    // If no contacts found, fall back to center-based direction
    if (totalWeight === 0) {
      return this.getDirectionFromCenter(body);
    }

    // Normalize by total weight to get average direction
    totalWeightedNormal.x /= totalWeight;
    totalWeightedNormal.y /= totalWeight;
    totalWeightedNormal.z /= totalWeight;

    // Normalize the vector to unit length
    const length = Math.sqrt(
      totalWeightedNormal.x ** 2 +
        totalWeightedNormal.y ** 2 +
        totalWeightedNormal.z ** 2
    );

    if (length > 0.001) {
      return {
        x: totalWeightedNormal.x / length,
        y: totalWeightedNormal.y / length,
        z: totalWeightedNormal.z / length,
      };
    }

    // Fall back to center-based direction if normalization fails
    return this.getDirectionFromCenter(body);
  }

  /**
   * Calculate direction away from center (y-axis) - fallback method
   */
  private getDirectionFromCenter(body: any): {
    x: number;
    y: number;
    z: number;
  } {
    const pos = body.translation();
    const horizontalDistance = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

    if (horizontalDistance < 0.001) {
      // If very close to center, pick a random horizontal direction
      const angle = this.rand.next() * Math.PI * 2;
      return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
    }

    // Normalize horizontal direction (don't push vertically)
    return {
      x: pos.x / horizontalDistance,
      y: 0, // Don't push vertically
      z: pos.z / horizontalDistance,
    };
  }

  /**
   * Start the overlap resolution process
   */
  private startOverlapResolution(): void {
    if (this.resolutionState !== "idle") return;

    const overlaps = this.detectOverlaps();
    if (overlaps.length === 0) return;

    this.resolutionState = "separating";
    this.resolutionIteration = 0;
    this.resolutionFrameCounter = 0;
    this.pendingOverlaps = overlaps;

    // Lock rotations only for dynamic bodies to prevent spinning during separation
    this.lockDynamicRotations();
  }

  /**
   * Process one step of the overlap resolution (called each frame)
   */
  private processOverlapResolutionStep(): number {
    if (this.resolutionState === "idle") return 0;

    this.resolutionFrameCounter++;

    if (this.resolutionState === "separating") {
      // Process separation every frame for smooth movement
      if (this.resolutionFrameCounter >= this.config.resolutionFramesPerStep!) {
        this.resolutionFrameCounter = 0;
        this.resolutionIteration++;

        // Detect current overlaps
        const currentOverlaps = this.detectOverlaps();

        if (
          currentOverlaps.length === 0 ||
          this.resolutionIteration >= this.config.maxResolutionIterations!
        ) {
          // Unlock rotations before settling
          this.unlockDynamicRotations();

          // Clear all momentum before transitioning to settling
          this.clearDynamicMomentum();

          // Start settling phase
          this.resolutionState = "settling";
          this.settleFrameCounter = 0;
          this.resolutionFrameCounter = 0;
          return this.resolutionIteration;
        }

        // For each overlap, move the appropriate body by a small step
        currentOverlaps.forEach((overlap) => {
          const body1 = this.rigidBodies[overlap.index1];
          const body2 = this.rigidBodies[overlap.index2];

          if (!body1 || !body2) return;

          let bodyToMove;

          // MODIFIED: Prioritize moving dynamic bodies over static bodies
          if (this.isBodyStatic(body1) && !this.isBodyStatic(body2)) {
            // body1 is static, body2 is dynamic - move body2
            bodyToMove = body2;
          } else if (!this.isBodyStatic(body1) && this.isBodyStatic(body2)) {
            // body1 is dynamic, body2 is static - move body1
            bodyToMove = body1;
          } else if (!this.isBodyStatic(body1) && !this.isBodyStatic(body2)) {
            // Both are dynamic - use distance-based logic as before
            const distance1 = this.getDistanceFromYAxis(body1);
            const distance2 = this.getDistanceFromYAxis(body2);
            bodyToMove = distance1 >= distance2 ? body1 : body2;
          } else {
            // Both are static - shouldn't happen, but skip if it does
            return;
          }

          // Get optimal separation direction based on contact normals and penetration depths
          const direction = this.getDirectionFromCenter(bodyToMove);
          if (!direction) return;

          // Move by just resolutionStep amount this frame
          const currentPos = bodyToMove.translation();
          const newPos = {
            x: currentPos.x + direction.x * this.config.resolutionStep!,
            y: currentPos.y, // Don't move vertically
            z: currentPos.z + direction.z * this.config.resolutionStep!,
          };

          // Move the body
          bodyToMove.setTranslation(newPos, true);

          // Zero out velocity to prevent bouncing
          bodyToMove.setLinvel({ x: 0, y: 0, z: 0 }, true);
          bodyToMove.setAngvel({ x: 0, y: 0, z: 0 }, true);
        });
      }
    } else if (this.resolutionState === "settling") {
      // Run settling physics every N frames
      if (this.resolutionFrameCounter >= this.config.settleFramesPerStep!) {
        this.resolutionFrameCounter = 0;

        this.world.step(this.eventQueue);

        this.resolutionState = "idle";
        return this.resolutionIteration;
      }
    }

    return this.resolutionIteration;
  }

  /**
   * Lock rotation for dynamic bodies only during separation
   */
  private lockDynamicRotations(): void {
    this.rigidBodies.forEach((rigidBody) => {
      if (!rigidBody || this.isBodyStatic(rigidBody)) return;

      // Lock all rotations for dynamic bodies only
      rigidBody.lockRotations(true, true);
    });
  }

  /**
   * Unlock rotations for dynamic bodies (restore normal rotation)
   */
  private unlockDynamicRotations(): void {
    this.rigidBodies.forEach((rigidBody) => {
      if (!rigidBody || this.isBodyStatic(rigidBody)) return;

      // Unlock rotations for dynamic bodies only - restore normal state
      rigidBody.lockRotations(false, true);
    });
  }

  /**
   * Clear all momentum (linear and angular velocity) from dynamic bodies only
   */
  private clearDynamicMomentum(): void {
    this.rigidBodies.forEach((rigidBody) => {
      if (!rigidBody || this.isBodyStatic(rigidBody)) return;

      // Set all velocities to zero for dynamic bodies only
      rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

      // Wake up the body so it responds to new forces
      if (rigidBody.isSleeping()) {
        rigidBody.wakeUp();
      }
    });
  }

  /**
   * Step the simulation forward
   */
  step(): SimulationResult {
    if (!this.isInitialized || !this.world) {
      throw new Error("Simulator not initialized. Call initialize() first.");
    }

    this.isRunning = true;

    let bodiesConnected = false;
    // Perform multiple physics steps per iteration
    for (let i = 0; i < this.config.stepsPerIteration; i++) {
      this.frameCount++;

      // Only apply gravitational forces when NOT in separating mode and only to dynamic bodies
      if (this.resolutionState === "idle") {
        // Apply gravitational forces to each dynamic body
        this.rigidBodies.forEach((rigidBody) => {
          if (!rigidBody || this.isBodyStatic(rigidBody)) return;

          // Wake up sleeping bodies
          if (rigidBody.isSleeping()) {
            rigidBody.wakeUp();
          }

          const position = rigidBody.translation();
          const velocity = rigidBody.linvel();
          const angVel = rigidBody.angvel();

          const distanceFromAxis = Math.sqrt(
            position.x * position.x + position.z * position.z
          );

          // Apply velocity damping
          const dampingFactor = Math.min(1.0, Math.pow(distanceFromAxis, 0.1));
          rigidBody.setLinvel(
            {
              x: velocity.x * dampingFactor,
              y: velocity.y * dampingFactor,
              z: velocity.z * dampingFactor,
            },
            true
          );
          rigidBody.setAngvel(
            {
              x: angVel.x * dampingFactor,
              y: angVel.y * dampingFactor,
              z: angVel.z * dampingFactor,
            },
            true
          );

          // Apply gravitational force toward center
          const direction = {
            x: -position.x,
            y: -position.y + this.config.verticalOffset,
            z: -position.z,
          };
          const length = Math.sqrt(
            direction.x ** 2 + direction.y ** 2 + direction.z ** 2
          );
          if (length > 0) {
            direction.x /= length;
            direction.y /= length;
            direction.z /= length;
          }

          const forceMultiplier =
            distanceFromAxis < 0.5 ? distanceFromAxis : 1.0;
          const impulse = {
            x:
              direction.x *
              this.config.gravityStrength *
              0.005 *
              forceMultiplier,
            y:
              direction.y *
              this.config.gravityStrength *
              0.005 *
              forceMultiplier *
              0.5,
            z:
              direction.z *
              this.config.gravityStrength *
              0.005 *
              forceMultiplier,
          };

          rigidBody.applyImpulse(impulse, true);
        });
      }

      // Step the physics world with configurable substeps for better collision resolution
      const substeps = this.config.substeps!;
      const substepTimeStep = this.config.timeStep / substeps;

      for (let substep = 0; substep < substeps; substep++) {
        this.world.timestep = substepTimeStep;
        this.world.step(this.eventQueue);
      }

      this.world.bodies.forEach((body: any) => {
        if (body.isDynamic()) {
          this.contactGraph.set(body.handle, new Set());
        }
      });
      bodiesConnected ||= this.areAllBodiesConnected();
    }

    // Start overlap resolution if simulation is complete or nearly complete
    let resolutionIterations = 0;
    if (
      bodiesConnected &&
      (this.attempts == 0
        ? this.frameCount >= this.maxInitialFrames
        : this.frameCount >= this.maxSubsequentFrames) &&
      this.resolutionState === "idle"
    ) {
      this.startOverlapResolution();
    }

    // Process overlap resolution if in progress
    if (this.resolutionState !== "idle") {
      resolutionIterations = this.processOverlapResolutionStep();
    }

    // Detect any remaining overlaps for reporting
    const overlaps = this.detectOverlaps();

    // Extract current state - include both static and dynamic shapes
    const shapes: ShapeState[] = this.rigidBodies.map((rigidBody, index) => {
      const position = rigidBody.translation();
      const rotation = rigidBody.rotation();
      const velocity = rigidBody.linvel();
      const angularVelocity = rigidBody.angvel();

      // Convert quaternion to euler angles
      const rot = new THREE.Quaternion(
        rotation.x,
        rotation.y,
        rotation.z,
        rotation.w
      );
      const euler = new THREE.Euler();
      euler.setFromQuaternion(rot);

      // Determine shape type, dimensions, and static status
      let shapeType: ShapeType;
      let dimensions: ShapeDims;
      let isStatic = false;

      if (index < this.staticBodyCount) {
        // This is a static shape - get from initialStaticShapes
        const staticShape = this.config.initialStaticShapes![index];
        shapeType = staticShape.type;
        dimensions =
          staticShape.dimensions ||
          this.getShapeDimensionsFromType(staticShape.type);
        isStatic = true;
      } else {
        // This is a dynamic shape - get from shapeDefinitions
        const dynamicIndex = index - this.staticBodyCount;
        const shapeDefinition = this.shapeDefinitions[dynamicIndex];
        shapeType = shapeDefinition.type;
        dimensions = shapeDefinition.dimensions;
      }

      return {
        type: shapeType,
        position: {
          x: position.x,
          y: position.y,
          z: position.z,
        },
        rotation: {
          x: euler.x,
          y: euler.y,
          z: euler.z,
        },
        velocity: {
          x: velocity.x,
          y: velocity.y,
          z: velocity.z,
        },
        angularVelocity: {
          x: angularVelocity.x,
          y: angularVelocity.y,
          z: angularVelocity.z,
        },
        sleeping: rigidBody.isSleeping(),
        isStatic,
        dimensions, // Include the original dimensions
      };
    });

    // Check for completion
    let isComplete = false;
    let spatialBounds = null;
    let completionReason: SimulationResult["completionReason"];

    if (this.rigidBodies.length > 1) {
      const settledState =
        this.resolutionState == "settling" && overlaps.length == 0;
      const immediateConnectionState =
        this.resolutionState == "idle" &&
        overlaps.length == 0 &&
        bodiesConnected;
      if (immediateConnectionState || settledState) {
        if (bodiesConnected || this.attempts >= this.maxAttempts) {
          isComplete = true;
          completionReason = "all_connected";
        } else {
          this.attempts++;
          this.frameCount = 0;
        }
      }

      if (isComplete) {
        spatialBounds = this.calculateSpatialBounds(shapes);

        this.isRunning = false;
      }
    } else {
      const velocity = this.rigidBodies[0].linvel();
      const speedSquared =
        Math.pow(velocity.x, 2) +
        Math.pow(velocity.y, 2) +
        Math.pow(velocity.z, 2);
      if (speedSquared < Math.pow(0.01, 2)) {
        isComplete = true;
        completionReason = "all_connected";
      }
    }

    return {
      shapes,
      frameCount: this.frameCount,
      isComplete,
      completionReason,
      overlaps,
      resolutionIterations,
      resolutionState: this.resolutionState,
      connectivityInfo:
        this.resolutionState === "settling"
          ? this.getConnectivityInfo()
          : undefined,

      ...(spatialBounds && {
        bottomY: spatialBounds.bottomY,
        middleY: spatialBounds.middleY,
        topY: spatialBounds.topY,
        sculptureHeight: spatialBounds.sculptureHeight,
      }),
    };
  }

  /**
   * Manually start overlap resolution (will be processed gradually over subsequent frames)
   */
  resolveOverlapsManually(): {
    started: boolean;
    currentState: "idle" | "separating" | "settling";
    remainingOverlaps: number;
    connectivityInfo?: any;
  } {
    if (!this.isInitialized || !this.world) {
      throw new Error("Simulator not initialized. Call initialize() first.");
    }

    const overlaps = this.detectOverlaps();
    let started = false;

    if (this.resolutionState === "idle" && overlaps.length > 0) {
      this.startOverlapResolution();
      started = true;
    }

    // Include connectivity info for debugging settling issues
    const connectivityInfo =
      this.resolutionState === "settling"
        ? this.getConnectivityInfo()
        : undefined;

    return {
      started,
      currentState: this.resolutionState,
      remainingOverlaps: overlaps.length,
      connectivityInfo,
    };
  }

  /**
   * Run the simulation until completion
   */
  async runToCompletion(): Promise<SimulationResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    let result: SimulationResult;
    do {
      result = this.step();
    } while (!result.isComplete);

    return result;
  }

  /**
   * Stop the simulation
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Reset the simulation
   */
  reset(): void {
    // Unlock rotations before cleanup
    if (this.rigidBodies && this.rigidBodies.length > 0) {
      this.unlockDynamicRotations();
    }

    if (this.world) {
      this.world.free();
    }
    this.world = null;
    this.rigidBodies = [];
    this.frameCount = 0;
    this.isInitialized = false;
    this.isRunning = false;
    this.staticBodyCount = 0;
    this.staticBodyHandles.clear();

    // Reset overlap resolution state
    this.resolutionState = "idle";
    this.resolutionIteration = 0;
    this.resolutionFrameCounter = 0;
    this.settleFrameCounter = 0;
    this.pendingOverlaps = [];
  }

  /**
   * Get current simulation status
   */
  getStatus(): {
    isInitialized: boolean;
    isRunning: boolean;
    frameCount: number;
    attempts: number;
    staticBodyCount: number;
    dynamicBodyCount: number;
  } {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      frameCount: this.frameCount,
      attempts: this.attempts,
      staticBodyCount: this.staticBodyCount,
      dynamicBodyCount: this.rigidBodies.length - this.staticBodyCount,
    };
  }

  /**
   * Update simulation configuration
   */
  updateConfig(newConfig: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Helper methods
  private getShapeRadius(type: ShapeType, dimensions: ShapeDims): number {
    switch (type) {
      case ShapeType.SPHERE:
        const sphereDims: SphereDims = dimensions as SphereDims;
        return sphereDims.r;
      case ShapeType.BOX:
      case ShapeType.ROUND_BOX:
        const boxDims: RoundBoxDims = dimensions as RoundBoxDims;
        return new THREE.Vector3(
          boxDims.a.x,
          boxDims.a.y,
          boxDims.a.z
        ).length();
      case ShapeType.CYLINDER:
        const cylinderDims: CylinderDims = dimensions as CylinderDims;
        return Math.max(cylinderDims.r * 2, cylinderDims.h * 2);
      case ShapeType.ROUND_CYLINDER:
        const roundCylinderDims: RoundCylinderDims =
          dimensions as RoundCylinderDims;
        return Math.max(
          (roundCylinderDims.r + roundCylinderDims.r2) * 2,
          (roundCylinderDims.h + roundCylinderDims.r2) * 2
        );
      case ShapeType.CONE:
        const coneDims: ConeDims = dimensions as ConeDims;
        return Math.max(
          2 * coneDims.h * Math.tan(coneDims.c.x / coneDims.c.y),
          coneDims.h
        );
      case ShapeType.HEX_PRISM:
        const hexPrismDims: HexPrismDims = dimensions as HexPrismDims;
        return Math.max(hexPrismDims.r * 2, hexPrismDims.h * 2);
      case ShapeType.TRI_PRISM:
        const triPrismDims: TriPrismDims = dimensions as TriPrismDims;
        return Math.max(triPrismDims.r, triPrismDims.h * 2);
      case ShapeType.CAPSULE:
        const capsuleDims: CapsuleDims = dimensions as CapsuleDims;
        return capsuleDims.r * 2 + capsuleDims.h * 2;
      case ShapeType.CUT_CONE:
        const cutConeDims: CutConeDims = dimensions as CutConeDims;
        return Math.max(cutConeDims.r * 2, cutConeDims.h * 2);
      case ShapeType.SOLID_ANGLE:
        const solidAngleDims: SolidAngleDims = dimensions as SolidAngleDims;
        return solidAngleDims.r;
      case ShapeType.CUT_SPHERE:
        const cutSphereDims: CutSphereDims = dimensions as CutSphereDims;
        return cutSphereDims.r;
      case ShapeType.ROUND_CONE:
        const roundConeDims: RoundConeDims = dimensions as RoundConeDims;
        return (
          Math.max(roundConeDims.r1, roundConeDims.r2) * 2 + roundConeDims.h
        );
      case ShapeType.OCTAHEDRON:
        const octahedronDims: OctahedronDims = dimensions as OctahedronDims;
        return octahedronDims.r;
      default:
        return 0.5;
    }
  }

  private wouldOverlap(
    pos1: [number, number, number],
    pos2: [number, number, number],
    radius1: number,
    radius2: number,
    buffer: number = 0.1
  ): boolean {
    const distance = Math.sqrt(
      Math.pow(pos1[0] - pos2[0], 2) +
        Math.pow(pos1[1] - pos2[1], 2) +
        Math.pow(pos1[2] - pos2[2], 2)
    );
    return distance < radius1 + radius2 + buffer;
  }

  private findValidPosition(
    shapeType: ShapeType,
    dimensions: ShapeDims,
    existingShapes: Array<{
      position: [number, number, number];
      radius: number;
    }>,
    baseAngle: number,
    addFromTop?: boolean
  ): [number, number, number] {
    const radius = this.getShapeRadius(shapeType, dimensions);

    for (let attempt = 0; attempt < 50; attempt++) {
      let position: [number, number, number];

      if (attempt < 10) {
        const angle = baseAngle + (this.rand.next() - 0.5) * 0.2;
        const x = Math.cos(angle) * this.config.radius;
        const z = Math.sin(angle) * this.config.radius;
        const y =
          this.config.verticalOffset +
          (addFromTop
            ? this.rand.next() * this.config.verticalSpread
            : (this.rand.next() - 0.5) * this.config.verticalSpread * 2);
        position = [x, y, z];
      } else {
        const angle = this.rand.next() * Math.PI * 2;
        const r = this.rand.next() * this.config.radius;
        const x = Math.cos(angle) * r;
        const z = Math.sin(angle) * r;
        const y =
          this.config.verticalOffset +
          (addFromTop
            ? this.rand.next() * this.config.verticalSpread
            : (this.rand.next() - 0.5) * this.config.verticalSpread * 2);
        position = [x, y, z];
      }

      let overlaps = false;
      for (const existing of existingShapes) {
        if (
          this.wouldOverlap(
            position,
            existing.position,
            radius,
            existing.radius
          )
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        return position;
      }
    }

    // Fallback position
    const angle = baseAngle;
    const x = Math.cos(angle) * this.config.radius;
    const z = Math.sin(angle) * this.config.radius;
    const y =
      this.config.verticalOffset +
      (addFromTop
        ? this.rand.next() * this.config.verticalSpread
        : (this.rand.next() - 0.5) * this.config.verticalSpread * 2);
    return [x, y, z];
  }
}
