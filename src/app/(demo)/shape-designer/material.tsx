"use client";

import { useRef, useState, useEffect, useMemo } from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import fragmentShader from "./addie.frag";
import vertexShader from "./addie.vert";

import { UiData, type Shape, type Material, type Light } from "./ui";

const MAX_SHAPES = 20;
const MAX_MATERIALS = 20;
const MAX_LIGHTS = 5;

export function ShaderMaterial({
  uiUniforms,
}: Readonly<{
  uiUniforms: UiData;
}>) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [compileTime, setCompileTime] = useState(0);
  const dpr = window.devicePixelRatio;

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

  const uniforms = useMemo(
    () => ({
      iTime: { value: 0.0 },
      iTimeDelta: { value: 0.0 },
      iFrame: { value: 0 },
      iResolution: { value: new THREE.Vector2(1, 1) },
      iMouse: { value: new THREE.Vector3(0, 0, 1) },
      numberOfShapes: { value: 0 },
      numberOfMaterials: { value: 0 },
      numberOfLights: { value: 0 },
      maxRays: { value: 0 },
      giLength: { value: 0 },
      giStrength: { value: 0 },
      aoStrength: { value: 0 },
      camTgt: { value: new THREE.Vector3(0, 0, 0) },
      camHeight: { value: 0 },
      camDist: { value: 0 },
      orbit: { value: 0 },
      shapes: { value: [] },
      materials: { value: [] },
      lights: { value: [] },
    }),
    []
  );

  useEffect(() => {
    if (materialRef.current) {
      const { uniforms } = materialRef.current;
      const shapes = [...uiUniforms.shapes];
      const materials = [...uiUniforms.materials];
      const lights = [...uiUniforms.lights];
      if (shapes.length < MAX_SHAPES) {
        for (let i = shapes.length; i < MAX_SHAPES; i++) {
          shapes.push(shapes[uiUniforms.shapes.length - 1]);
        }
      }
      if (materials.length < MAX_MATERIALS) {
        for (let i = materials.length; i < MAX_MATERIALS; i++) {
          materials.push(materials[uiUniforms.materials.length - 1]);
        }
      }
      if (lights.length < MAX_LIGHTS) {
        for (let i = lights.length; i < MAX_LIGHTS; i++) {
          lights.push(lights[uiUniforms.lights.length - 1]);
        }
      }

      uniforms.shapes.value = shapes.map((shape: Shape) => ({
        type: shape.type,
        id: shape.id,
        l: shape.l,
        c: shape.c,
        a: shape.a,
        b: shape.b,
        n: shape.n,
        pos: shape.pos,
        h: shape.h,
        r: shape.r,
        r1: shape.r1,
        r2: shape.r2,
        mat: shape.mat,
        rot: new THREE.Matrix3()
          .setFromMatrix4(
            new THREE.Matrix4()
              .makeRotationFromEuler(
                new THREE.Euler(
                  (shape.rot.x / 180) * Math.PI,
                  (shape.rot.y / 180) * Math.PI,
                  (shape.rot.z / 180) * Math.PI
                )
              )
              .invert()
          )
          .toArray(),
        isRot: shape.rot.x != 0 || shape.rot.y != 0 || shape.rot.z != 0,
      }));
      uniforms.materials.value = materials.map((material: Material) => ({
        emissive: material.emissive,
        color: {
          x: material.color.r,
          y: material.color.g,
          z: material.color.b,
        },
        innerColor: {
          x: material.innerColor.r,
          y: material.innerColor.g,
          z: material.innerColor.b,
        },
        glowColor: {
          x: material.glowColor.r,
          y: material.glowColor.g,
          z: material.glowColor.b,
        },
        kd: material.kd,
        ior: material.ior,
        reflectivity: Math.floor(material.reflectivity * 1000) / 1000,
        intRef: material.intRef,
        roughness: material.roughness,
        reflectRoughness: material.reflectRoughness,
        refractRoughness: material.refractRoughness,
        metallic: material.metallic,
        transparency: Math.floor(material.transparency * 1000) / 1000,
        attenuation: material.attenuation,
        attenuationStrength: material.attenuationStrength,
        glow: material.glow,
      }));
      uniforms.lights.value = lights.map((light: Light) => ({
        type: light.type,
        strength: light.strength,
        color: { x: light.color.r, y: light.color.g, z: light.color.b },
        ranged: light.ranged,
        r: light.r,
        dir: light.dir,
        pos: light.pos,
      }));
      uniforms.numberOfShapes.value = uiUniforms.globals.numberOfShapes;
      uniforms.numberOfMaterials.value = uiUniforms.globals.numberOfMaterials;
      uniforms.numberOfLights.value = uiUniforms.globals.numberOfLights;
      uniforms.maxRays.value = uiUniforms.globals.maxRays;
      uniforms.giLength.value = uiUniforms.globals.giLength;
      uniforms.giStrength.value = uiUniforms.globals.giStrength;
      uniforms.aoStrength.value = uiUniforms.globals.aoStrength;
      uniforms.camTgt.value = uiUniforms.globals.camTgt;
      uniforms.camHeight.value = uiUniforms.globals.camHeight;
      uniforms.camDist.value = uiUniforms.globals.camDist;
      uniforms.orbit.value = uiUniforms.globals.orbit;
    }
  }, [uiUniforms]);

  useFrame((state) => {
    if (materialRef.current) {
      const { uniforms } = materialRef.current;
      const { elapsedTime } = state.clock;

      uniforms.iTimeDelta.value = elapsedTime - uniforms.iTime.value;
      uniforms.iTime.value = elapsedTime;
      uniforms.iResolution.value.set(640 * dpr, 360 * dpr, 1);
      uniforms.iMouse.value.set(mouse.x, mouse.y, 1);
      uniforms.iFrame.value = uniforms.iFrame.value + 1;
      setCompileTime((prevTime) => {
        if (prevTime == 0) return elapsedTime;
        return prevTime;
      });
    }
  });

  useEffect(() => {
    if (compileTime != 0) {
      console.log(compileTime);
    }
  }, [compileTime]);

  return (
    <shaderMaterial
      ref={materialRef as React.RefObject<THREE.ShaderMaterial>}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      transparent={false}
      opacity={1}
    />
  );
}
