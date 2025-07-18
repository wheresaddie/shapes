import { Effect } from "postprocessing";
import * as THREE from "three";
import fragmentShader from "./rough.frag";

export class RoughnessBlurEffect extends Effect {
  constructor({ blurRadius = 15, normalSensitivity = 100 } = {}) {
    super("RoughnessBlurEffect", fragmentShader, {
      blendFunction: THREE.NormalBlending,
      uniforms: new Map([
        ["blurRadius", new THREE.Uniform(blurRadius)],
        ["normalSensitivity", new THREE.Uniform(normalSensitivity)],
      ]),
    });
  }

  set blurRadius(value: number) {
    this.uniforms.get("blurRadius")!.value = value;
  }

  set normalSensitivity(value: number) {
    this.uniforms.get("normalSensitivity")!.value = value;
  }
}
