"use client";

import {
  useRef,
  useState,
  useEffect,
  useMemo,
  useCallback,
  RefObject,
} from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import fragmentShaderTemplate from "./sculpture.frag";
import vertexShader from "./sculpture.vert";

import { UiData, TemplateData, type Material } from "./datamanager";

import { Eta } from "eta";

const eta = new Eta({ autoEscape: false, useWith: true });

//const MAX_SHAPES = 10;
//const MAX_MATERIALS = 20;

const toFloat = (n: number) => {
  return Number.isInteger(n) ? n.toFixed(1) : n.toFixed(4);
};

const SHADER_SET = 1 << 0;
const SHAPES_SET = 1 << 1;
const MATERIALS_SET = 1 << 2;
const PERFORMANCE_SETTINGS_SET = 1 << 3;
const GLOBALS_SET = 1 << 4;
const ALL_SET =
  SHADER_SET |
  SHAPES_SET |
  MATERIALS_SET |
  PERFORMANCE_SETTINGS_SET |
  GLOBALS_SET;

export function ShaderMaterial({
  dataRef,
  templateVariables,
  shapesUpdated = 0,
  materialsUpdated = 0,
  performanceSettingsUpdated = 0,
  perfUpdated,
  globalsUpdated,
  setCompiled,
  devMode,
}: Readonly<{
  dataRef: RefObject<UiData>;
  templateVariables: TemplateData;
  shapesUpdated?: number;
  materialsUpdated?: number;
  performanceSettingsUpdated?: number;
  perfUpdated?: number;
  globalsUpdated?: number;
  setCompiled?: React.Dispatch<React.SetStateAction<boolean>>;
  devMode: boolean;
}>) {
  const materialRef = useRef<THREE.ShaderMaterial>(undefined);
  const [material, setMaterial] = useState<THREE.ShaderMaterial>();
  //const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [fragmentShader, setFragmentShader] = useState("");
  const dpr = window.devicePixelRatio;
  const dataReady = useRef(0);

  /*
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Convert mouse position to Shadertoy's coordinate system
      // (pixels from bottom-left)
      const canvas = document.getElementById("canvas");
      const rect = canvas?.getBoundingClientRect();
      if (
        event.buttons &&
        event.clientX < 640 * dpr &&
        event.clientY < 360 * dpr
      ) {
        setMouse({
          x: (event.clientX - rect!.left) * dpr,
          y: (event.clientY - rect!.top) * dpr,
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [dpr]);
  */

  const uniforms = useMemo(
    () => ({
      iTime: { value: 0.0 },
      iTimeDelta: { value: 0.0 },
      iFrame: { value: 0 },
      iResolution: { value: new THREE.Vector2(1, 1) },
      //iMouse: { value: new THREE.Vector3(0, 0, 1) },
      showDebug: { value: false },
      showBoxes: { value: false },
      showBoundingBox: { value: false },
      debugMode: { value: 0 },
      mapScale: { value: 1.0 },
      maxRays: { value: 0 },
      marchingSteps: { value: 0 },
      distanceThreshold: { value: 0 },
      maxDistance: { value: 0 },
      giLength: { value: 0 },
      giStrength: { value: 0 },
      aoStrength: { value: 0 },
      shadowRange: { value: 0 },
      shadowAccuracy: { value: 0 },
      roughReflectSamples: { value: 0 },
      roughRefractSamples: { value: 0 },
      camTgt: { value: new THREE.Vector3(0, 0, 0) },
      camHAngle: { value: 0 },
      camVAngle: { value: 0 },
      camDist: { value: 0 },
      camShiftTime: { value: 0 },
      camShiftOffset: { value: 0 },
      boundingBoxPos: { value: new THREE.Vector3(0, 0, 0) },
      boundingBoxDims: { value: new THREE.Vector3(1, 1, 1) },
      shapes: { value: [] },
      shapePositions: { value: [] },
      shapeRotations: { value: [] },
      shapeIsRotated: { value: [] },
      materials: { value: [] },
      lights: { value: [] },
      globalIllumination: { value: true },
      lighting: { value: true },
      shadows: { value: true },
      surfaceBlur: { value: true },
    }),
    []
  );

  useEffect(() => {
    const t = eta.renderString(fragmentShaderTemplate, {
      ...templateVariables,
      _f: toFloat,
    });
    dataReady.current = SHADER_SET;
    setFragmentShader(t);
  }, [templateVariables]);

  // Update fragment shader on existing material
  useEffect(() => {
    if (materialRef.current && fragmentShader) {
      materialRef.current.fragmentShader = fragmentShader;
      materialRef.current.needsUpdate = true;
    }
  }, [fragmentShader]);

  const handleMaterialRef = useCallback(
    (m: THREE.ShaderMaterial) => {
      if (m) {
        materialRef.current = m;
        setMaterial(m); // This ensures useEffect hooks can run
        if (setCompiled) setCompiled(true);
      }
    },
    [setCompiled]
  );

  useEffect(() => {
    if (material && dataRef.current && shapesUpdated) {
      const uiUniforms = dataRef.current;
      const { uniforms } = material;
      if (devMode) {
        const shapes: any[] = [];
        uiUniforms.shapes.forEach((shape) => {
          shapes.push({
            a: { x: 0, y: 0, z: 0 },
            c: { x: 0, y: 0 },
            ...shape,
            rot: new THREE.Matrix3()
              .setFromMatrix4(
                new THREE.Matrix4()
                  .makeRotationFromEuler(
                    new THREE.Euler(shape.rot.x, shape.rot.y, shape.rot.z)
                  )
                  .invert()
              )
              .toArray(),
            isRot: shape.rot.x != 0 || shape.rot.y != 0 || shape.rot.z != 0,
          });
        });
        uniforms.shapes.value = shapes;
        uniforms.lights.value = uiUniforms.lights;
      } else {
        const shapePositions = [...uiUniforms.shapes.map((s) => s.pos)];
        uniforms.shapePositions.value = shapePositions.map(
          (s) => new THREE.Vector3(s.x, s.y, s.z)
        );

        const shapeRotations = [
          ...uiUniforms.shapes.map((s) =>
            new THREE.Matrix3().setFromMatrix4(
              new THREE.Matrix4()
                .makeRotationFromEuler(
                  new THREE.Euler(s.rot.x, s.rot.y, s.rot.z)
                )
                .invert()
            )
          ),
        ];
        uniforms.shapeRotations.value = shapeRotations;

        uniforms.shapeIsRotated.value = uiUniforms.shapes.map(
          (s) => s.rot.x != 0 || s.rot.y != 0 || s.rot.z != 0
        );
      }
    }
    dataReady.current |= SHAPES_SET;
  }, [dataRef, devMode, shapesUpdated, material, uniforms]);

  useEffect(() => {
    if (
      material &&
      dataRef.current &&
      (materialsUpdated || perfUpdated || performanceSettingsUpdated)
    ) {
      const { uniforms } = material;
      const uiUniforms = dataRef.current;
      const materials = [...uiUniforms.materials];
      const performanceSettings =
        uiUniforms.performanceSettings[uiUniforms.globals.perf];
      uniforms.materials.value = materials.map((material: Material) => ({
        color: {
          x: material.color.r,
          y: material.color.g,
          z: material.color.b,
        },
        secondaryColor: {
          x: material.secondaryColor.r,
          y: material.secondaryColor.g,
          z: material.secondaryColor.b,
        },
        kd: material.kd,
        ior: material.ior,
        reflectivity: performanceSettings.reflection
          ? Math.floor(material.reflectivity * 1000) / 1000
          : 0,
        intRef: performanceSettings.internalReflections && material.intRef,
        roughness: material.roughness,
        reflectRoughness: material.reflectRoughness,
        refractRoughness: material.refractRoughness,
        surfaceBlur: material.surfaceBlur,
        metallic: material.metallic,
        transparency: performanceSettings.transparency
          ? Math.floor(material.transparency * 1000) / 1000
          : 0,
        attenuation: material.attenuation,
        attenuationStrength: material.attenuationStrength,
        edgeTintStrength: material.edgeTintStrength,
      }));
    }
    dataReady.current |= MATERIALS_SET;
  }, [
    dataRef,
    materialsUpdated,
    performanceSettingsUpdated,
    perfUpdated,
    material,
  ]);

  useEffect(() => {
    if (material && dataRef.current && globalsUpdated) {
      const uiUniforms = dataRef.current;
      const { uniforms } = material;
      uniforms.showDebug.value = uiUniforms.globals.showDebug;
      uniforms.debugMode.value = uiUniforms.globals.debugMode;
      uniforms.mapScale.value = uiUniforms.globals.mapScale;
      uniforms.showBoxes.value = uiUniforms.globals.showBoxes;
      uniforms.showBoundingBox.value = uiUniforms.globals.showBoundingBox;

      uniforms.camTgt.value = uiUniforms.globals.camTgt;
      uniforms.camHAngle.value = uiUniforms.globals.camHAngle;
      uniforms.camVAngle.value = uiUniforms.globals.camVAngle;
      uniforms.camDist.value = uiUniforms.globals.camDist;

      uniforms.boundingBoxPos.value = uiUniforms.globals.boundingBoxPos;
      uniforms.boundingBoxDims.value = uiUniforms.globals.boundingBoxDims;
    }
    dataReady.current |= GLOBALS_SET;
  }, [dataRef, globalsUpdated, material]);

  useEffect(() => {
    if (
      material &&
      dataRef.current &&
      (performanceSettingsUpdated || perfUpdated)
    ) {
      const { uniforms } = material;
      const uiUniforms = dataRef.current;

      const performanceSettings =
        uiUniforms.performanceSettings[uiUniforms.globals.perf];

      uniforms.maxRays.value = performanceSettings.maxRays;
      uniforms.marchingSteps.value = performanceSettings.marchingSteps;
      uniforms.distanceThreshold.value = performanceSettings.distanceThreshold;
      uniforms.maxDistance.value = performanceSettings.maxDistance;
      uniforms.giLength.value = performanceSettings.giLength;
      uniforms.giStrength.value = performanceSettings.giStrength;
      uniforms.aoStrength.value = performanceSettings.aoStrength;
      uniforms.shadowRange.value = performanceSettings.shadowRange;
      uniforms.shadowAccuracy.value = performanceSettings.shadowAccuracy;
      uniforms.roughReflectSamples.value =
        performanceSettings.roughReflectSamples;
      uniforms.roughRefractSamples.value =
        performanceSettings.roughRefractSamples;
      uniforms.globalIllumination.value =
        performanceSettings.globalIllumination;
      uniforms.lighting.value = performanceSettings.lighting;
      uniforms.shadows.value = performanceSettings.shadows;
      uniforms.surfaceBlur.value = performanceSettings.surfaceBlur;
    }
    dataReady.current |= PERFORMANCE_SETTINGS_SET;
  }, [dataRef, performanceSettingsUpdated, perfUpdated, material]);

  useFrame((state) => {
    if (material) {
      const { uniforms } = material;
      const { elapsedTime } = state.clock;

      uniforms.iTimeDelta.value = elapsedTime - uniforms.iTime.value;
      uniforms.iTime.value = elapsedTime;
      uniforms.iResolution.value.set(640 * dpr, 360 * dpr, 1);
      //uniforms.iMouse.value.set(mouse.x, mouse.y, 1);
      uniforms.iFrame.value = uniforms.iFrame.value + 1;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (materialRef.current) {
        materialRef.current.dispose();
      }
    };
  }, []);

  return (
    <>
      {dataReady.current & ALL_SET && (
        <shaderMaterial
          ref={handleMaterialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent={false}
          opacity={1}
          onBeforeRender={() => {
            if (setCompiled) setCompiled(true);
          }}
        />
      )}
    </>
  );
}
