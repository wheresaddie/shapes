// raymarchingUI.ts
import React, { useEffect, useRef } from "react";
import { Pane, FolderApi } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import * as THREE from "three";

import { v4 as uuidv4 } from "uuid";
import DataManager, {
  AllPerformanceSettings,
  DebugMode,
  Light,
  LightType,
  Material,
  PerformanceMode,
  Shape,
  ShapeType,
  UiData,
} from "@/lib/datamanager";

export class RaymarchingUI {
  container: HTMLElement;
  pane: Pane;
  shapeFolder: FolderApi | null = null;
  materialFolder: FolderApi | null = null;
  lightFolder: FolderApi | null = null;
  dataManager: DataManager;

  constructor(container: HTMLElement, dataManager: DataManager) {
    this.dataManager = dataManager;
    this.pane = new Pane({
      title: "Raymarching Config",
      container: container ?? undefined,
    });

    this.pane.registerPlugin(EssentialsPlugin);

    const data = this.dataManager.getData().current;
    this.container = container;

    if (data && data.globals) {
      if ((data?.globals?.perf as unknown) == "LOW")
        data.globals.perf = PerformanceMode.GOOD;
      if ((data?.globals?.perf as unknown) == "MEDIUM")
        data.globals.perf = PerformanceMode.BETTER;
      if ((data?.globals?.perf as unknown) == "HIGH")
        data.globals.perf = PerformanceMode.BEST;
    }

    this.build(data);
  }

  build(data?: UiData) {
    this.pane.children.forEach((child) => {
      this.pane.remove(child);
    });

    if (data) {
      this.dataManager.setData(JSON.parse(JSON.stringify(data)));
    }

    this.pane.addButton({ title: "Export" }).on("click", () => {
      const state: UiData = this.dataManager.getData().current;
      const jsonStr = JSON.stringify(state, null, 2); // pretty-print with 2-space indent
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = Date.now() + "-vars.json";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(url);
    });

    this.pane.addButton({ title: "Import" }).on("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.style.display = "none"; // not visible in the DOM

      input.addEventListener("change", (event) => {
        const file = (event.target as any).files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target!.result as string);
            this.build(json);
          } catch (err) {
            console.error("Invalid JSON:", err);
          }
        };
        reader.readAsText(file);
      });

      document.body.appendChild(input); // necessary for some browsers
      input.click(); // trigger file dialog
      document.body.removeChild(input); // clean up
    });

    this.setupGlobalFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupPerformanceFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupShapesFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupMaterialsFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupFloorFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupLightsFolder();
    this.pane.on("change", () => {
      this.save();
    });
  }

  save() {
    this.dataManager.recompileShader();
    this.dataManager.updateAllUniforms();
    localStorage.setItem(
      "shape-designer",
      JSON.stringify(this.dataManager.getData().current)
    );
  }

  setupGenerationFolder() {
    const f = this.pane.addFolder({
      title: "Generation",
      expanded: true,
    });
    f.addBinding(
      this.dataManager.data.current.generationSettings!,
      "sculptureId",
      {
        label: "Sculpture ID",
      }
    );
    const genIdBtn = f.addButton({ title: "Generate ID" });
    genIdBtn.on("click", () => {
      this.dataManager.data.current.generationSettings!.sculptureId = uuidv4();
      this.pane.refresh();
      this.save();
    });
    f.addBinding(
      this.dataManager.data.current.generationSettings!,
      "baseShapeCount",
      {
        label: "Base Shape Count",
        min: 1,
        max: 10,
        step: 1,
      }
    );
    f.addBinding(
      this.dataManager.data.current.generationSettings!,
      "upgradeShapeCount",
      {
        label: "Upgrades Shape Count",
        min: 1,
        max: 5,
        step: 1,
      }
    );

    f.addButton({ title: "Generate Sculpture" }).on("click", async () => {
      this.dataManager.generateBaseSculpture().then(() => {
        this.save();
      });
    });

    f.addButton({ title: "Upgrade Sculpture" }).on("click", async () => {
      this.dataManager.upgradeSculpture().then(() => {
        this.save();
      });
    });
  }

  setupGlobalFolder() {
    const f = this.pane.addFolder({
      title: "Global Settings",
      expanded: false,
    });
    f.addBinding(this.dataManager.data.current.globals, "devMode", {
      label: "Dev Mode",
    }).on("change", () => {
      this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      this.dataManager.recompileShader();
    });
    f.addBinding(this.dataManager.data.current.globals, "camTgt", {
      label: "Camera Target",
      step: 0.01,
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
    });
    f.addBinding(this.dataManager.data.current.globals, "boundingBoxPos", {
      label: "Bounding Box Position",
      x: { min: -10, max: 10, step: 0.01 },
      y: { min: 0, max: 10, step: 0.01 },
      z: { min: -10, max: 10, step: 0.01 },
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
      this.dataManager.recompileShader();
    });
    f.addBinding(this.dataManager.data.current.globals, "boundingBoxDims", {
      label: "Bounding Box Dimensions",
      x: { min: 0, max: 5, step: 0.01 },
      y: { min: 0, max: 5, step: 0.01 },
      z: { min: 0, max: 5, step: 0.01 },
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
      this.dataManager.recompileShader();
    });
    f.addBlade({
      view: "separator",
    });
    f.addBinding(this.dataManager.data.current.globals, "showDebug", {
      label: "Show Debug",
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
    });
    f.addBinding(this.dataManager.data.current.globals, "debugMode", {
      label: "Debug Mode",
      options: Object.keys(DebugMode)
        .filter((v) => isNaN(Number(v)) === false)
        .map((v) => ({
          text: DebugMode[parseInt(v)],
          value: parseInt(v),
        })),
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
    });
    f.addBinding(this.dataManager.data.current.globals, "mapScale", {
      min: 0.0,
      max: 2.0,
      step: 0.1,
      label: "Heatmap Scale",
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
    });
    f.addBinding(this.dataManager.data.current.globals, "showBoxes", {
      label: "Show Shape Boxes",
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
      this.dataManager.recompileShader();
    });
    f.addBinding(this.dataManager.data.current.globals, "showBoundingBox", {
      label: "Show Bounding Box",
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
      this.dataManager.recompileShader();
    });
  }

  setupPerformanceFolder() {
    const f = this.pane.addFolder({
      title: "Performance Settings",
      expanded: false,
    });
    const tabs = f.addTab({
      pages: [{ title: "Good" }, { title: "Better" }, { title: "Best" }],
    });

    const mode = ["GOOD", "BETTER", "BEST"] as Array<
      keyof AllPerformanceSettings
    >;
    for (let i = 0; i < 3; i++) {
      const key = mode[i];
      const p = this.dataManager.data.current.performanceSettings[key];
      tabs.pages[i]
        .addBinding(p, "maxRays", {
          min: 1,
          max: 40,
          step: 1,
          label: "Max Rays",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "marchingSteps", {
          min: 0,
          max: 200,
          step: 1,
          label: "Marching Steps",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "distanceThreshold", {
          min: 0.00001,
          max: 0.001,
          step: 0.00001,
          label: "Distance Threshold",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      p.maxDistance = p.maxDistance ?? 20.0;
      tabs.pages[i]
        .addBinding(p, "maxDistance", {
          min: 1.0,
          max: 100.0,
          step: 1.0,
          label: "Max Distance",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "giLength", {
          min: 0,
          max: 0.1,
          step: 0.001,
          label: "GI Length",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "giStrength", {
          min: 0,
          max: 0.1,
          step: 0.001,
          label: "GI Strength",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "aoStrength", {
          min: 0,
          max: 0.1,
          step: 0.001,
          label: "AO Strength",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "shadowRange", {
          min: 0,
          max: 20.0,
          step: 0.01,
          label: "Shadow Range",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "shadowAccuracy", {
          min: 8.0,
          max: 24.0,
          step: 1.0,
          label: "Shadow Accuracy",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "roughReflectSamples", {
          min: 0,
          max: 16.0,
          step: 1.0,
          label: "Rough Reflect Samples",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "roughRefractSamples", {
          min: 0,
          max: 16.0,
          step: 1.0,
          label: "Rough Refract Samples",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "globalIllumination", {
          label: "Global Illumination",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "reflection", {
          label: "Reflection",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "transparency", {
          label: "Transparency",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "lighting", {
          label: "Lighting",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "shadows", {
          label: "Shadows",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
      tabs.pages[i]
        .addBinding(p, "surfaceBlur", {
          label: "Surface Blur",
        })
        .on("change", () => {
          if (this.dataManager.setPerformanceSettingsUpdated) {
            this.dataManager.setPerformanceSettingsUpdated((prev) => prev + 1);
          }
        });
    }
  }

  setupFloorFolder() {
    const f = this.pane.addFolder({ title: "Floor", expanded: false });

    f.addBinding(this.dataManager.data.current.materials[0], "color", {
      label: "Color",
      color: { type: "float" },
    }).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
    f.addBinding(this.dataManager.data.current.materials[0], "kd", {
      min: 0,
      max: 100,
      step: 0.01,
      label: "Diffuse Strength",
    }).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
    f.addBinding(this.dataManager.data.current.materials[0], "reflectivity", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Reflectivity",
    }).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
    this.dataManager.data.current.materials[0].intRef =
      this.dataManager.data.current.materials[0].intRef ?? false;
    f.addBinding(this.dataManager.data.current.materials[0], "roughness", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Roughness",
    }).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
    this.dataManager.data.current.materials[0].reflectRoughness =
      this.dataManager.data.current.materials[0].reflectRoughness ?? 0.0;
    f.addBinding(
      this.dataManager.data.current.materials[0],
      "reflectRoughness",
      {
        min: 0,
        max: 1,
        step: 0.01,
        label: "Reflect Roughness",
      }
    ).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
    this.dataManager.data.current.materials[0].intRef = false;
    this.dataManager.data.current.materials[0].surfaceBlur =
      this.dataManager.data.current.materials[0].surfaceBlur ?? 0.0;
    f.addBinding(this.dataManager.data.current.materials[0], "surfaceBlur", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Surface Blur",
    }).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
    f.addBinding(this.dataManager.data.current.materials[0], "metallic", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Metallic",
    }).on("change", () => {
      this.dataManager.setMaterialsUpdated!((prev) => prev + 1);
    });
  }

  addLight(light: Light) {
    light.name = light.name ?? `Light ${light.uuid}`;
    const f = this.lightFolder!.addFolder({
      title: light.name,
      expanded: false,
    });
    f.addBinding(light, "name", {
      label: "Name",
    }).on("change", (ev) => {
      f.title = ev.value;
    });
    f.addBinding(light, "type", {
      label: "Type",
      options: Object.keys(LightType)
        .filter((v) => isNaN(Number(v)) === false)
        .map((v) => ({ text: LightType[parseInt(v)], value: parseInt(v) })),
      disabled: light.type === LightType.OMNI,
    });
    light.strength = light.strength ?? 1;
    f.addBinding(light, "strength", {
      min: 0,
      max: 5,
      step: 0.1,
      label: "Strength",
    });
    f.addBinding(light, "color", { color: { type: "float" }, label: "Color" });
    f.addBinding(light, "dir", { label: "Direction" });
    f.addBinding(light, "pos", { label: "Position" });
    f.addBinding(light, "ranged", { label: "Ranged" });
    f.addBinding(light, "r", { min: 0, max: 10, label: "Radius" });
    light.castsShadow = light.castsShadow ?? true;
    f.addBinding(light, "castsShadow", { label: "Casts Shadow" });

    if (light.uuid !== "DEFAULT") {
      const rmBtn = f.addButton({ title: "Remove" });
      rmBtn.on("click", () => {
        if (
          light.type === LightType.OMNI ||
          this.dataManager.data.current.lights.length <= 1
        )
          return;
        this.dataManager.data.current.lights.splice(
          this.dataManager.data.current.lights.findIndex(
            (el) => el.uuid == light.uuid
          ),
          1
        );
        this.lightFolder!.remove(f);
        this.pane.refresh();
        this.save();
      });
    }
  }

  setupLightsFolder() {
    this.lightFolder = this.pane.addFolder({
      title: "Lights",
      expanded: false,
    });

    const addBtn = this.lightFolder.addButton({ title: "Add Light" });
    addBtn.on("click", () => {
      const hasOmni = this.dataManager.data.current.lights.some(
        (l) => l.type === LightType.OMNI
      );
      const light = this.dataManager.defaultLight(
        hasOmni ? LightType.POINT : LightType.OMNI
      );
      light.uuid = uuidv4();
      this.addLight(light);
      this.dataManager.data.current.lights.push(light);
      this.pane.refresh();
      this.save();
    });

    this.dataManager.data.current.lights.forEach((light, index) => {
      if (!light.uuid) {
        if (index == 0) {
          light.uuid = "DEFAULT";
        } else {
          light.uuid = uuidv4();
        }
      }
      this.addLight(light);
    });
  }

  setupShapesFolder() {
    this.shapeFolder = this.pane.addFolder({ title: "Shapes" });

    const addBtn = this.shapeFolder.addButton({ title: "Add Shape" });
    addBtn.on("click", () => {
      const shape = this.dataManager.defaultShape();
      this.dataManager.data.current.shapes.push(shape);
      shape.uuid = uuidv4();
      this.addShape(shape);
      this.pane.refresh();
      this.save();
    });

    this.dataManager.data.current.shapes.forEach((shape, index) => {
      if (!shape.uuid) {
        if (index == 0) {
          shape.uuid = "DEFAULT";
        } else {
          shape.uuid = uuidv4();
        }
      }
      this.addShape(shape);
    });
  }

  addShapeBinding(shape: Shape, f: FolderApi) {
    // Add shape-specific bindings
    switch (shape.type) {
      case ShapeType.OCTAHEDRON:
      case ShapeType.SPHERE:
        if (shape.r === undefined) {
          shape.r = 0.3;
        }
        f.addBinding(shape, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;

      case ShapeType.ROUND_BOX:
        if (shape.r === undefined) {
          shape.r = 0.15;
        }
        f.addBinding(shape, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });

      case ShapeType.BOX:
        if (shape.a === undefined) {
          shape.h = 0.5;
          shape.r1 = 0.5;
          shape.r2 = 0.5;
        }
        f.addBinding(shape, "h", {
          label: "Width",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", () => {
          shape.a = {
            x: (shape.h! || 0) / 2,
            y: (shape.r1 || 0) / 2,
            z: (shape.r2 || 0) / 2,
          };
        });
        f.addBinding(shape, "r1", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", () => {
          shape.a = {
            x: (shape.h! || 0) / 2,
            y: (shape.r1 || 0) / 2,
            z: (shape.r2 || 0) / 2,
          };
        });
        f.addBinding(shape, "r2", {
          label: "Depth",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", () => {
          shape.a = {
            x: (shape.h! || 0) / 2,
            y: (shape.r1 || 0) / 2,
            z: (shape.r2 || 0) / 2,
          };
        });
        shape.a = {
          x: (shape.h! || 0) / 2,
          y: (shape.r1 || 0) / 2,
          z: (shape.r2 || 0) / 2,
        };

        break;
      case ShapeType.LINK:
      case ShapeType.ROUND_CONE:
        if (shape.h === undefined) {
          shape.h = 0.1;
        }
        f.addBinding(shape, "h", {
          label: "Height",
          min: 0,
          max: 0.5,
          step: 0.01,
        });

      case ShapeType.TORUS:
        if (shape.r1 === undefined) {
          shape.r1 = 0.1;
        }
        if (shape.r2 === undefined) {
          shape.r2 = 0.05;
        }
        f.addBinding(shape, "r1", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shape, "r2", {
          label: "Inner Radius",
          min: 0,
          max: 0.25,
          step: 0.01,
        });
        break;
      case ShapeType.CONE:
        if (shape.h === undefined) {
          shape.h = 0.3;
        }
        if (shape.r === undefined) {
          shape.r = 0.2;
        }
        const vCone = new THREE.Vector2(shape.r, shape.h).normalize();
        shape.c = { x: vCone.x, y: vCone.y };
        f.addBinding(shape, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", () => {
          const v = new THREE.Vector2(shape.r, shape.h).normalize();
          shape.c = { x: v.x, y: v.y };
        });
        f.addBinding(shape, "r", {
          label: "Radius",
          min: 0,
          max: 0.25,
          step: 0.01,
        }).on("change", () => {
          const v = new THREE.Vector2(shape.r, shape.h).normalize();
          shape.c = { x: v.x, y: v.y };
        });
        break;
      case ShapeType.HEX_PRISM:
      case ShapeType.TRI_PRISM:
        if (shape.h === undefined) {
          shape.h = 0.5;
          if (shape.r !== undefined) {
            shape.c = { x: shape.r / 2, y: shape.h / 2 };
          }
        }
        if (shape.r === undefined) {
          shape.r = 0.25;
          shape.c = { x: shape.r / 2, y: shape.h / 2 };
        }
        f.addBinding(shape, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shape.h = ev.value!;
          shape.c = { x: shape.r! / 2, y: shape.h / 2 };
        });
        f.addBinding(shape, "r", {
          label: "Width",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shape.r = ev.value!;
          shape.c = { x: shape.r / 2, y: shape.h! / 2 };
        });
        break;
      case ShapeType.ROUND_CYLINDER:
        if (shape.r === undefined) {
          shape.r = 0.1;
        }
        if (shape.r2 === undefined) {
          shape.r2 = 0.05;
        }
        if (shape.h === undefined) {
          shape.h = 0.15;
        }
        f.addBinding(shape, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shape, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        });
        f.addBinding(shape, "r2", {
          label: "Edge Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;
      case ShapeType.CAPSULE:
      case ShapeType.CYLINDER:
        if (shape.r === undefined) {
          shape.r = 0.1;
        }
        if (shape.r1 === undefined) {
          shape.r1 = 0.2;
        }
        if (shape.h === undefined) {
          shape.h = 0.1;
        }

        f.addBinding(shape, "r", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        });
        f.addBinding(shape, "r1", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        }).on("change", (ev) => {
          shape.r1 = ev.value;
          shape.h = shape.r1! / 2;
        });
        break;
      case ShapeType.CUT_CONE:
        if (shape.h === undefined) {
          shape.h = 0.2;
        }
        if (shape.r1 === undefined) {
          shape.r = 0.1;
        }
        if (shape.r2 === undefined) {
          shape.r2 = 0.2;
        }
        f.addBinding(shape, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        });
        f.addBinding(shape, "r", {
          label: "Radius 1",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shape, "r2", {
          label: "Radius 2",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;
      case ShapeType.SOLID_ANGLE:
        if (shape.r === undefined) {
          shape.r = 0.35;
        }
        if (shape.h === undefined) {
          shape.h = 0.67;
        }
        shape.c = { x: Math.sin(shape.h), y: Math.cos(shape.h) };
        f.addBinding(shape, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shape, "h", {
          label: "Theta",
          min: 0,
          max: Math.PI,
          step: 0.01,
        }).on("change", (ev) => {
          shape.c = { x: Math.sin(ev.value!), y: Math.cos(ev.value!) };
        });
        break;
      case ShapeType.CUT_SPHERE:
        if (shape.r === undefined) {
          shape.r = 0.2;
        }
        if (shape.h === undefined) {
          shape.h = 0.0;
        }
        f.addBinding(shape, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shape, "h", {
          label: "Cutoff",
          min: -0.5,
          max: 0.5,
          step: 0.01,
        });
        break;
    }
  }

  removeShapeBinding(f: FolderApi) {
    f.children.forEach((child: any) => {
      if (!["type", "pos", "mat", "rot"].includes(child.key)) {
        f.remove(child);
      }
    });
  }

  addShapeMaterial(f: FolderApi, shape: Shape) {
    f.addBinding(shape, "mat", {
      label: "Material",
      options: this.dataManager.data.current.materials
        .slice(1)
        .map((m, i) => ({ text: m.name, value: i + 1 })),
    });
  }

  addShape(shape: Shape) {
    const f = this.shapeFolder!.addFolder({ title: `Shape ${shape.uuid}` });
    f.addBinding(shape, "type", {
      options: Object.keys(ShapeType)
        .filter((v) => isNaN(Number(v)) === false)
        .map((v) => ({ text: ShapeType[parseInt(v)], value: parseInt(v) })),
      defaultValue: shape.type,
      label: "Type",
    }).on("change", () => {
      this.removeShapeBinding(f);
      delete shape.r;
      delete shape.r1;
      delete shape.r2;
      delete shape.h;
      delete shape.c;
      delete shape.a;
      this.addShapeBinding(shape, f);
    });
    f.addBinding(shape, "pos", {
      label: "Position",
      x: { min: -10, max: 10, step: 0.01 },
      y: { min: 0, max: 10, step: 0.01 },
      z: { min: -10, max: 10, step: 0.01 },
    }).on("change", () =>
      this.dataManager.setShapesUpdated((prev) => prev + 1)
    );
    shape.rot = shape.rot ?? { x: 0, y: 0, z: 0 };
    f.addBinding(shape, "rot", {
      label: "Rotation",
      x: { min: -Math.PI, max: Math.PI, step: 0.1 },
      y: { min: -Math.PI, max: Math.PI, step: 0.1 },
      z: { min: -Math.PI, max: Math.PI, step: 0.1 },
    }).on("change", () =>
      this.dataManager.setShapesUpdated((prev) => prev + 1)
    );
    this.addShapeMaterial(f, shape);

    if (shape.uuid !== "DEFAULT") {
      const rmBtn = f.addButton({ title: "Remove" });
      rmBtn.on("click", () => {
        if (this.dataManager.data.current.shapes.length <= 1) return;
        this.dataManager.data.current.shapes.splice(
          this.dataManager.data.current.shapes.findIndex(
            (el) => el.uuid == shape.uuid
          ),
          1
        );
        this.shapeFolder!.remove(f);
        this.pane.refresh();
        this.dataManager.setShapesUpdated((prev) => prev + 1);
        this.save();
      });
    }

    this.addShapeBinding(shape, f);
  }

  updateShapeMaterial() {
    let index = 0;
    this.shapeFolder?.children.forEach((child) => {
      if (child instanceof FolderApi) {
        const found = child.children.filter((c) => (c as any).key === "mat");
        if (found) {
          this.addShapeMaterial(
            child,
            this.dataManager.data.current.shapes[index]
          );
          child.remove(found[0]);
        }
        index++;
      }
    });
  }

  addMaterial(mat: Material) {
    const f = this.materialFolder!.addFolder({ title: `Material ${mat.uuid}` });
    f.addBinding(mat, "name", { label: "Name" }).on("change", () => {
      this.updateShapeMaterial();
    });
    f.addBinding(mat, "color", { label: "Color", color: { type: "float" } });
    mat.secondaryColor = mat.secondaryColor ?? { r: 1.0, g: 1.0, b: 1.0 };
    f.addBinding(mat, "secondaryColor", {
      label: "Secondary Color",
      color: { type: "float" },
    });
    f.addBinding(mat, "kd", {
      min: 0,
      max: 10,
      step: 0.01,
      label: "Diffuse Strength",
    });
    f.addBinding(mat, "ior", {
      min: 1,
      max: 2,
      step: 0.01,
      label: "Index of Refraction",
    });
    f.addBinding(mat, "reflectivity", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Reflectivity",
    });
    mat.intRef = mat.intRef ?? false;
    f.addBinding(mat, "intRef", { label: "Internal Reflection" });
    f.addBinding(mat, "roughness", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Roughness",
    });
    mat.reflectRoughness = mat.reflectRoughness ?? 0.0;
    f.addBinding(mat, "reflectRoughness", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Reflect Roughness",
    });
    mat.refractRoughness = mat.refractRoughness ?? 0.0;
    f.addBinding(mat, "refractRoughness", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Refract Roughness",
    });
    mat.surfaceBlur = mat.surfaceBlur ?? 0.0;
    f.addBinding(mat, "surfaceBlur", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Surface Blur",
    });
    f.addBinding(mat, "metallic", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Metallic",
    });
    f.addBinding(mat, "transparency", {
      min: 0,
      max: 1,
      step: 0.01,
      label: "Transparency",
    });
    f.addBinding(mat, "attenuation", {
      min: 0,
      max: 1,
      step: 0.0001,
      label: "Attenuation",
    });
    f.addBinding(mat, "attenuationStrength", {
      min: 0,
      max: 50,
      step: 0.1,
      label: "Attenuation Strength",
    });
    f.addBinding(mat, "edgeTintStrength", {
      min: 0,
      max: 1.0,
      step: 0.01,
      label: "Edge Tint Strength",
    });

    if (mat.uuid != "DEFAULT" && mat.uuid != "FLOOR") {
      const rmBtn = f.addButton({ title: "Remove" });
      rmBtn.on("click", () => {
        if (this.dataManager.data.current.materials.length <= 1) return;
        this.dataManager.data.current.materials.splice(
          this.dataManager.data.current.materials.findIndex(
            (el) => el.uuid == mat.uuid
          ),
          1
        );
        this.materialFolder!.remove(f);
        this.updateShapeMaterial();
        this.pane.refresh();
        this.save();
      });
    }
  }

  setupMaterialsFolder() {
    this.materialFolder = this.pane.addFolder({ title: "Materials" });

    const addBtn = this.materialFolder.addButton({ title: "Add Material" });
    addBtn.on("click", () => {
      const material = this.dataManager.defaultMaterial();
      material.name = `Material ${this.dataManager.data.current.materials.length}`;
      material.uuid = uuidv4();
      this.addMaterial(material);
      this.dataManager.data.current.materials.push(material);
      this.updateShapeMaterial();
      this.pane!.refresh();
      this.save();
    });

    this.dataManager.data.current.materials.forEach((mat, index) => {
      if (index > 0) {
        if (!mat.uuid) {
          if (index == 1) {
            mat.uuid = "DEFAULT";
          } else {
            mat.uuid = uuidv4();
          }
        }
        this.addMaterial(mat);
      }
    });
  }
}

const RaymarchingUIWrapper = ({
  dataManager,
  loaded,
}: Readonly<{
  dataManager?: DataManager;
  loaded: boolean;
}>) => {
  // This component wraps the RaymarchingUI and handles the rendering
  // of the UI in a React-friendly way. It uses a ref to attach the UI
  // to a specific DOM element.
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && dataManager && loaded) {
      new RaymarchingUI(containerRef.current, dataManager);
    }
  }, [dataManager, loaded]);

  return <div ref={containerRef} />; // This is where the UI will be rendered
};

export default React.memo(RaymarchingUIWrapper);
