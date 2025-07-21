// raymarchingUI.ts
import React, { useEffect, useRef } from "react";
import { Pane, FolderApi } from "tweakpane";
import * as EssentialsPlugin from "@tweakpane/plugin-essentials";
import { createMultiSelectBlade } from "@/lib/multiblade";

import * as THREE from "three";
import { v4 as uuidv4 } from "uuid";
import DataManager, {
  AllPerformanceSettings,
  ColorPalette,
  ColorPaletteColor,
  DebugMode,
  Light,
  LightType,
  MaterialGeneratorDetails,
  PerformanceMode,
  Shape,
  ShapeGeneratorDetails,
  ShapeType,
  UiData,
} from "@/lib/datamanager";

export class RaymarchingUI {
  container: HTMLElement;
  pane: Pane;
  shapeFolder: FolderApi | null = null;
  shapeRulesFolder: FolderApi | null = null;
  materialRulesFolder: FolderApi | null = null;
  lightFolder: FolderApi | null = null;
  dataManager: DataManager;

  constructor(container: HTMLElement, dataManager: DataManager) {
    this.dataManager = dataManager;
    this.pane = new Pane({
      title: "Raymarching Config",
      container: container ?? undefined,
    });

    this.pane.registerPlugin(EssentialsPlugin);

    const stored = localStorage.getItem("sculpture-generator");

    let data;
    if (stored) {
      data = JSON.parse(stored) as UiData;
    }
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

    if (!stored) {
      this.save();
    }
  }

  build(data?: UiData) {
    this.pane.children.forEach((child) => {
      this.pane.remove(child);
    });

    this.dataManager.setData(data);
    this.dataManager.updateAllUniforms();

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

    this.setupGenerationFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupGlobalFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupPerformanceFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupColorPalettesFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupShapeRulesFolder();
    this.pane.addBlade({ view: "separator" });
    this.setupMaterialRulesFolder();
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
      "sculpture-generator",
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
    });
    f.addBinding(this.dataManager.data.current.globals, "showBoundingBox", {
      label: "Show Bounding Box",
    }).on("change", () => {
      if (this.dataManager.setGlobalsUpdated) {
        this.dataManager.setGlobalsUpdated((prev) => prev + 1);
      }
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
        .addBinding(p, "internalReflections", {
          label: "Internal Reflections",
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

  addColor(
    paletteFolder: FolderApi,
    color: ColorPaletteColor,
    palette: ColorPalette
  ) {
    color.name = color.name ?? `Color ${color.uuid}`;
    const colorFolder = paletteFolder.addFolder({
      title: color.name,
      expanded: true,
    });
    colorFolder
      .addBinding(color, "name", {
        label: "Name",
      })
      .on("change", (ev) => {
        colorFolder.title = ev.value;
      });
    colorFolder.addBinding(color, "color", {
      label: "Color",
      color: { type: "float" },
    });
    colorFolder
      .addBinding(color, "probability", {
        label: "Probability",
      })
      .on("change", () => this.save());
    colorFolder.addButton({ title: "Remove Color" }).on("click", () => {
      palette.colors.splice(
        palette.colors.findIndex((el) => el.uuid == color.uuid),
        1
      );
      paletteFolder.remove(colorFolder);
      this.pane.refresh();
      this.save();
    });
  }

  addColorPalette(f: FolderApi, palette: ColorPalette) {
    const paletteFolder = f.addFolder({ title: palette.name, expanded: false });
    paletteFolder
      .addBinding(palette, "name", { label: "Palette Name" })
      .on("change", (ev) => {
        paletteFolder.title = ev.value;
        this.updateMaterialRules();
        this.pane.refresh();
        this.save();
      });
    const colorsFolder = paletteFolder.addFolder({
      title: "Colors",
      expanded: true,
    });
    palette.colors.forEach((color) => {
      this.addColor(colorsFolder, color, palette);
    });
    palette.probability = palette.probability ?? 1.0;
    paletteFolder.addBinding(palette, "probability", { label: "Probability" });
    paletteFolder.addButton({ title: "Add Color" }).on("click", () => {
      const uuid = uuidv4();
      const newColor: ColorPaletteColor = {
        name: `Color ${uuid}`,
        color: { r: 1, g: 1, b: 1 },
        probability: 0.5,
        uuid,
      };
      palette.colors.push(newColor);
      this.addColor(colorsFolder, newColor, palette);
      this.pane.refresh();
      this.save();
    });
    paletteFolder.addButton({ title: "Remove Palette" }).on("click", () => {
      this.dataManager.data.current.colorPalettes!.splice(
        this.dataManager.data.current.colorPalettes!.findIndex(
          (el) => el.uuid == palette.uuid
        ),
        1
      );
      f.remove(paletteFolder);

      this.updateMaterialRules();

      this.pane.refresh();
      this.save();
    });
    this.updateMaterialRules();
  }

  setupColorPalettesFolder() {
    const f = this.pane.addFolder({ title: "Color Palettes", expanded: false });
    const paletteFolder = f.addFolder({ title: "Palettes", expanded: true });
    this.dataManager.data.current.colorPalettes!.forEach((palette) => {
      this.addColorPalette(paletteFolder, palette);
    });
    f.addButton({ title: "Add Palette" }).on("click", () => {
      const newPalette = this.dataManager.defaultColorPalette();
      newPalette.uuid = uuidv4();
      newPalette.name = `Palette ${newPalette.uuid}`;
      this.dataManager.data.current.colorPalettes!.push(newPalette);
      this.addColorPalette(paletteFolder, newPalette);
      this.pane.refresh();
      this.save();
    });
  }

  addShapeRuleBinding(shapeRule: ShapeGeneratorDetails, f: FolderApi) {
    // Add shape-specific bindings
    switch (shapeRule.type) {
      case ShapeType.OCTAHEDRON:
      case ShapeType.SPHERE:
        shapeRule.r = shapeRule.r ?? { min: 0.1, max: 0.1 };
        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;

      case ShapeType.ROUND_BOX:
        shapeRule.r = shapeRule.r ?? { min: 0.3, max: 0.3 };
        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });

      case ShapeType.BOX:
        if (shapeRule.a === undefined) {
          shapeRule.h = { min: 0.1, max: 0.1 };
          shapeRule.r1 = { min: 0.1, max: 0.1 };
          shapeRule.r2 = { min: 0.1, max: 0.1 };
          shapeRule.a = {
            min: {
              x: (shapeRule.h!.min! || 0) / 2,
              y: (shapeRule.r1!.min || 0) / 2,
              z: (shapeRule.r2!.min || 0) / 2,
            },
            max: {
              x: (shapeRule.h!.max! || 0) / 2,
              y: (shapeRule.r1!.max || 0) / 2,
              z: (shapeRule.r2!.max || 0) / 2,
            },
          };
        } else {
          shapeRule.h = {
            min: shapeRule.a.min.x * 2,
            max: shapeRule.a.max.x * 2,
          };
          shapeRule.r1 = {
            min: shapeRule.a.min.y * 2,
            max: shapeRule.a.max.y * 2,
          };
          shapeRule.r2 = {
            min: shapeRule.a.min.z * 2,
            max: shapeRule.a.max.z * 2,
          };
        }
        f.addBinding(shapeRule, "h", {
          label: "Width",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.h!.min = ev.value!.min;
          shapeRule.h!.max = ev.value!.max;
          if (!shapeRule.a) {
            shapeRule.a = {
              min: { x: 0, y: 0, z: 0 },
              max: { x: 0, y: 0, z: 0 },
            };
          }
          shapeRule.a.min = {
            x: (shapeRule.h!.min! || 0) / 2,
            y: (shapeRule.r1!.min || 0) / 2,
            z: (shapeRule.r2!.min || 0) / 2,
          };
          shapeRule.a.max = {
            x: (shapeRule.h!.max! || 0) / 2,
            y: (shapeRule.r1!.max || 0) / 2,
            z: (shapeRule.r2!.max || 0) / 2,
          };
        });

        f.addBinding(shapeRule, "r1", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.r1!.min = ev.value!.min;
          shapeRule.r1!.max = ev.value!.max;
          if (!shapeRule.a) {
            shapeRule.a = {
              min: { x: 0, y: 0, z: 0 },
              max: { x: 0, y: 0, z: 0 },
            };
          }
          shapeRule.a.min = {
            x: (shapeRule.h!.min! || 0) / 2,
            y: (shapeRule.r1!.min || 0) / 2,
            z: (shapeRule.r2!.min || 0) / 2,
          };
          shapeRule.a.max = {
            x: (shapeRule.h!.max! || 0) / 2,
            y: (shapeRule.r1!.max || 0) / 2,
            z: (shapeRule.r2!.max || 0) / 2,
          };
        });

        f.addBinding(shapeRule, "r2", {
          label: "Depth",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.r2!.min = ev.value!.min;
          shapeRule.r2!.max = ev.value!.max;
          if (!shapeRule.a) {
            shapeRule.a = {
              min: { x: 0, y: 0, z: 0 },
              max: { x: 0, y: 0, z: 0 },
            };
          }
          shapeRule.a.min = {
            x: (shapeRule.h!.min! || 0) / 2,
            y: (shapeRule.r1!.min || 0) / 2,
            z: (shapeRule.r2!.min || 0) / 2,
          };
          shapeRule.a.max = {
            x: (shapeRule.h!.max! || 0) / 2,
            y: (shapeRule.r1!.max || 0) / 2,
            z: (shapeRule.r2!.max || 0) / 2,
          };
        });

        break;
      case ShapeType.LINK:
      case ShapeType.ROUND_CONE:
        shapeRule.h = shapeRule.h ?? { min: 0.1, max: 0.1 };
        f.addBinding(shapeRule, "h", {
          label: "Height",
          min: 0,
          max: 0.5,
          step: 0.01,
        });

      case ShapeType.TORUS:
        shapeRule.r1 = shapeRule.r1 ?? { min: 0.3, max: 0.3 };
        shapeRule.r2 = shapeRule.r2 ?? { min: 0.1, max: 0 };
        f.addBinding(shapeRule, "r1", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shapeRule, "r2", {
          label: "Inner Radius",
          min: 0,
          max: 0.25,
          step: 0.01,
        });
        break;
      case ShapeType.CONE:
        shapeRule.h = shapeRule.h ?? { min: 0.5, max: 0.5 };
        shapeRule.r = shapeRule.r ?? { min: 0.25, max: 0.25 };
        if (!shapeRule.c) {
          shapeRule.c = {
            min: { x: 0.0, y: 0.0 },
            max: { x: 0.0, y: 0.0 },
          };
        }
        const vConeMin = new THREE.Vector2(
          shapeRule.r.min,
          shapeRule.h.min
        ).normalize();
        const vConeMax = new THREE.Vector2(
          shapeRule.r.max,
          shapeRule.h.max
        ).normalize();

        shapeRule.c.min = { x: vConeMin.x, y: vConeMin.y };
        shapeRule.c.max = { x: vConeMax.x, y: vConeMax.y };

        f.addBinding(shapeRule, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", () => {
          const vMin = new THREE.Vector2(
            shapeRule.r!.min,
            shapeRule.h!.min
          ).normalize();
          shapeRule.c!.min = { x: vMin.x, y: vMin.y };
          const vMax = new THREE.Vector2(
            shapeRule.r!.max,
            shapeRule.h!.max
          ).normalize();
          shapeRule.c!.max = { x: vMax.x, y: vMax.y };
        });

        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.25,
          step: 0.01,
        }).on("change", () => {
          const vMin = new THREE.Vector2(
            shapeRule.r!.min,
            shapeRule.h!.min
          ).normalize();
          shapeRule.c!.min = { x: vMin.x, y: vMin.y };
          const vMax = new THREE.Vector2(
            shapeRule.r!.max,
            shapeRule.h!.max
          ).normalize();
          shapeRule.c!.max = { x: vMax.x, y: vMax.y };
        });
        break;
      case ShapeType.HEX_PRISM:
        shapeRule.h = shapeRule.h ?? { min: 0.5, max: 0.5 };
        shapeRule.r = shapeRule.r ?? { min: 0.25, max: 0.25 };
        if (shapeRule.c === undefined) {
          shapeRule.c = {
            min: { x: shapeRule.r.min, y: shapeRule.h.min },
            max: { x: shapeRule.r.max, y: shapeRule.h.max },
          };
        }

        f.addBinding(shapeRule, "r", {
          label: "Width",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.r!.min = ev.value!.min;
          shapeRule.r!.max = ev.value!.max;
          shapeRule.c = {
            min: { x: shapeRule.r!.min, y: shapeRule.h!.min / 2 },
            max: { x: shapeRule.r!.max, y: shapeRule.h!.max / 2 },
          };
        });

        f.addBinding(shapeRule, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.h!.min = ev.value!.min;
          shapeRule.h!.max = ev.value!.max;
          shapeRule.c = {
            min: { x: shapeRule.r!.min, y: shapeRule.h!.min / 2 },
            max: { x: shapeRule.r!.max, y: shapeRule.h!.max / 2 },
          };
        });
        break;
      case ShapeType.TRI_PRISM:
        shapeRule.h = shapeRule.h ?? { min: 0.5, max: 0.5 };
        shapeRule.r = shapeRule.r ?? { min: 0.25, max: 0.25 };
        if (shapeRule.c === undefined) {
          shapeRule.c = {
            min: { x: shapeRule.r.min, y: shapeRule.h.min / 2 },
            max: { x: shapeRule.r.max, y: shapeRule.h.max / 2 },
          };
        }

        f.addBinding(shapeRule, "r", {
          label: "Width",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.r!.min = ev.value!.min;
          shapeRule.r!.max = ev.value!.max;
          shapeRule.c = {
            min: { x: shapeRule.r!.min, y: shapeRule.h!.min / 2 },
            max: { x: shapeRule.r!.max, y: shapeRule.h!.max / 2 },
          };
        });

        f.addBinding(shapeRule, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.h!.min = ev.value!.min;
          shapeRule.h!.max = ev.value!.max;
          shapeRule.c = {
            min: { x: shapeRule.r!.min, y: shapeRule.h!.min },
            max: { x: shapeRule.r!.max, y: shapeRule.h!.max },
          };
        });
        break;
      case ShapeType.ROUND_CYLINDER:
        shapeRule.r = shapeRule.r ?? { min: 0.5, max: 0.5 };
        shapeRule.r2 = shapeRule.r2 ?? { min: 0.125, max: 0.125 };
        shapeRule.h = shapeRule.h ?? { min: 0.1, max: 0.1 };
        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shapeRule, "h", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        });
        f.addBinding(shapeRule, "r2", {
          label: "Edge Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;
      case ShapeType.CAPSULE:
      case ShapeType.CYLINDER:
        shapeRule.r = shapeRule.r ?? { min: 0.5, max: 0.5 };
        shapeRule.h = shapeRule.h ?? { min: 1.0, max: 1.0 };
        shapeRule.r1 = shapeRule.h;

        f.addBinding(shapeRule, "r1", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.r1!.min = ev.value!.min;
          shapeRule.r1!.max = ev.value!.max;
          shapeRule.h = {
            min: shapeRule.r1!.min / 2,
            max: shapeRule.r1!.max / 2,
          };
        });

        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;
      case ShapeType.CUT_CONE:
        shapeRule.h = shapeRule.h ?? { min: 1.0, max: 1.0 };
        shapeRule.r = shapeRule.r ?? { min: 0.5, max: 0.5 };
        shapeRule.r2 = shapeRule.r2 ?? { min: 0.5, max: 0.5 };
        shapeRule.r1 = shapeRule.h;
        f.addBinding(shapeRule, "r1", {
          label: "Height",
          min: 0,
          max: 1.0,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.r1!.min = ev.value!.min;
          shapeRule.r1!.max = ev.value!.max;
          shapeRule.h = {
            min: shapeRule.r1!.min / 2,
            max: shapeRule.r1!.max / 2,
          };
        });

        f.addBinding(shapeRule, "r2", {
          label: "Top Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shapeRule, "r", {
          label: "Bottom Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        break;
      case ShapeType.SOLID_ANGLE:
        shapeRule.h = shapeRule.h ?? {
          min: Math.PI / 2,
          max: Math.PI / 2,
        };
        shapeRule.r = shapeRule.r ?? { min: 0.5, max: 0.5 };

        shapeRule.c = {
          min: { x: Math.sin(shapeRule.h.min), y: Math.cos(shapeRule.h.min) },
          max: { x: Math.sin(shapeRule.h.max), y: Math.cos(shapeRule.h.max) },
        };

        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shapeRule, "h", {
          label: "Theta Min",
          min: 0,
          max: Math.PI,
          step: 0.01,
        }).on("change", (ev) => {
          shapeRule.h!.min = ev.value!.min;
          shapeRule.h!.max = ev.value!.max;
          shapeRule.c!.min = {
            x: Math.sin(ev.value!.min / 2),
            y: Math.cos(ev.value!.min / 2),
          };
          shapeRule.c!.max = {
            x: Math.sin(ev.value!.max / 2),
            y: Math.cos(ev.value!.max / 2),
          };
        });
        break;
      case ShapeType.CUT_SPHERE:
        shapeRule.h = shapeRule.h ?? { min: 0.0, max: 0.0 };
        shapeRule.r = shapeRule.r ?? { min: 0.5, max: 0.5 };
        f.addBinding(shapeRule, "r", {
          label: "Radius",
          min: 0,
          max: 0.5,
          step: 0.01,
        });
        f.addBinding(shapeRule, "h", {
          label: "Cutoff",
          min: -1.0,
          max: 1.0,
          step: 0.01,
        });
        break;
    }
  }

  removeShapeRuleBinding(f: FolderApi) {
    f.children.forEach((child: any) => {
      if (
        !["name", "type", "mats", "probability", "upgrade"].includes(
          child.key
        ) &&
        child.constructor.name !== "SeparatorBladeApi"
      ) {
        f.remove(child);
      }
    });
  }

  addShapeMaterialRules(
    f: FolderApi,
    shapeRule: ShapeGeneratorDetails,
    index?: number
  ) {
    return createMultiSelectBlade(
      f,
      this.dataManager.data.current
        .materialRules!.slice(0)
        .map((m) => ({ label: m.name, value: m.uuid })),
      {
        label: "Materials",
        values: shapeRule.mats,
        onChange: (selected: string[]) => {
          shapeRule.mats = selected;
          this.save();
        },
      },
      index
    );
  }

  addShapeRule(shapeRule: ShapeGeneratorDetails) {
    shapeRule.name = shapeRule.name ?? `Shape Rule ${shapeRule.uuid}`;
    const f = this.shapeRulesFolder!.addFolder({
      title: shapeRule.name,
      expanded: false,
    });
    f.addBinding(shapeRule, "name", { label: "Name" }).on("change", (ev) => {
      f.title = ev.value;
    });
    f.addBinding(shapeRule, "type", {
      options: Object.keys(ShapeType)
        .filter((v) => isNaN(Number(v)) === false)
        .map((v) => ({ text: ShapeType[parseInt(v)], value: parseInt(v) })),
      defaultValue: shapeRule.type,
      label: "Type",
    }).on("change", () => {
      this.removeShapeRuleBinding(f);
      this.addShapeRuleBinding(shapeRule, f);
    });
    this.addShapeMaterialRules(f, shapeRule);

    f.addBinding(shapeRule, "probability", { label: "Probability" });

    const rmBtn = f.addButton({ title: "Remove" });
    rmBtn.on("click", () => {
      if (this.dataManager.data.current.shapes.length <= 1) return;
      this.dataManager.data.current.shapes.splice(
        this.dataManager.data.current.shapes.findIndex(
          (el) => el.uuid == shapeRule.uuid
        ),
        1
      );
      this.shapeRulesFolder!.remove(f);
      this.pane.refresh();
      this.save();
    });

    this.addShapeRuleBinding(shapeRule, f);
  }

  setupShapeRulesFolder() {
    this.shapeRulesFolder = this.pane.addFolder({
      title: "Shape Rules",
      expanded: false,
    });

    const addBtn = this.shapeRulesFolder.addButton({ title: "Add Shape Rule" });
    addBtn.on("click", () => {
      const shapeRule = this.dataManager.defaultShapeRule();
      this.dataManager.data.current.shapeRules!.push(shapeRule);
      shapeRule.uuid = uuidv4();
      this.addShapeRule(shapeRule);
      this.pane.refresh();
      this.save();
    });

    this.dataManager.data.current.shapeRules!.forEach((shapeRule, index) => {
      if (!shapeRule.uuid) {
        if (index == 0) {
          shapeRule.uuid = "DEFAULT";
        } else {
          shapeRule.uuid = uuidv4();
        }
      }
      this.addShapeRule(shapeRule);
    });
  }

  updateShapeMaterialRules() {
    let index = 0;
    this.shapeRulesFolder?.children.forEach((child) => {
      if (child instanceof FolderApi) {
        const foundIndex = child.children.findIndex(
          (c) => c.constructor.name === "SeparatorBladeApi"
        );
        if (foundIndex >= 0) {
          this.addShapeMaterialRules(
            child,
            this.dataManager.data.current.shapeRules![index],
            foundIndex
          );
        }
        index++;
      }
    });
  }

  addMaterialMultiSelect(
    f: FolderApi,
    mat: MaterialGeneratorDetails,
    key: keyof Pick<MaterialGeneratorDetails, "color" | "secondaryColor">,
    label: string,
    index?: number
  ) {
    return createMultiSelectBlade(
      f,
      this.dataManager.data.current
        .colorPalettes!.slice(0)
        .map((c) => ({ label: c.name, value: c.uuid })),
      {
        label: label,
        values: mat[key],
        onChange: (selected: string[]) => {
          mat[key] = selected;
          this.save();
        },
      },
      index
    );
  }

  addMaterialRule(mat: MaterialGeneratorDetails) {
    mat.name = mat.name ?? `Material Rule ${mat.uuid}`;
    const f = this.materialRulesFolder!.addFolder({
      title: mat.name,
      expanded: false,
    });
    f.addBinding(mat, "name", { label: "Name" }).on("change", (ev) => {
      f.title = ev.value;
      this.updateShapeMaterialRules();
    });

    this.addMaterialMultiSelect(f, mat, "color", "Color");
    this.addMaterialMultiSelect(f, mat, "secondaryColor", "Secondary Color");

    f.addBinding(mat, "kd", {
      min: 0,
      max: 10,
      step: 0.01,
      label: "Diffuse Strength",
    });
    f.addBinding(mat, "ior", {
      min: 1,
      max: 5,
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
    mat.edgeTintStrength = mat.edgeTintStrength ?? { min: 0, max: 1 };
    f.addBinding(mat, "edgeTintStrength", {
      min: 0,
      max: 1,
      step: 0.1,
      label: "Edge Tint Strength",
    });
    mat.probability = mat.probability ?? 1.0;
    f.addBinding(mat, "probability", {
      label: "Probability",
    });

    if (mat.uuid != "FLOOR") {
      const rmBtn = f.addButton({ title: "Remove" });
      rmBtn.on("click", () => {
        this.dataManager.data.current.materialRules!.splice(
          this.dataManager.data.current.materialRules!.findIndex(
            (el) => el.uuid == mat.uuid
          ),
          1
        );
        this.materialRulesFolder!.remove(f);
        this.updateShapeMaterialRules();
        this.pane.refresh();
        this.save();
      });
    }
  }

  updateMaterialRules() {
    this.materialRulesFolder?.children.forEach((child, childIndex) => {
      if (child instanceof FolderApi) {
        this.materialRulesFolder?.remove(child);
        const mat =
          this.dataManager.data.current.materialRules![childIndex - 1]; // -1 because first child is the add button
        this.addMaterialRule(mat);
      }
    });
  }

  setupMaterialRulesFolder() {
    this.materialRulesFolder = this.pane.addFolder({
      title: "Material Rules",
      expanded: false,
    });

    const addBtn = this.materialRulesFolder.addButton({
      title: "Add Material Rule",
    });
    addBtn.on("click", () => {
      const materialRule = this.dataManager.defaultMaterialRule();
      materialRule.uuid = uuidv4();
      materialRule.name = `Material ${materialRule.uuid}`;
      this.addMaterialRule(materialRule);
      this.dataManager.data.current.materialRules!.push(materialRule);
      this.updateShapeMaterialRules();
      this.pane!.refresh();
      this.save();
    });

    this.dataManager.data.current.materialRules!.forEach((mat, index) => {
      if (!mat.uuid) {
        if (index == 0) {
          mat.uuid = "FLOOR";
        } else if (index == 1) {
          mat.uuid = "DEFAULT";
        } else {
          mat.uuid = uuidv4();
        }
      }
      if (mat.uuid != "FLOOR") {
        this.addMaterialRule(mat);
      }
    });
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
    this.dataManager.data.current.materials[0].intRef = false;
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
    this.dataManager.data.current.materials[0].refractRoughness = 0.0;
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
    this.shapeFolder = this.pane.addFolder({
      title: "Shapes",
      expanded: false,
    });

    this.dataManager.data.current.shapes.forEach((shape) => {
      shape.uuid = uuidv4();
      this.addShape(shape);
    });
  }

  addShape(shape: Shape) {
    const f = this.shapeFolder!.addFolder({
      title: `Shape ${shape.uuid}`,
      expanded: false,
    });
    shape.pos = { x: 0, y: 0, z: 0 };
    f.addBinding(shape, "pos", {
      label: "Position",
      x: { min: -10, max: 10, step: 0.01 },
      y: { min: 0, max: 10, step: 0.01 },
      z: { min: -10, max: 10, step: 0.01 },
    });
    shape.rot = shape.rot ?? { x: 0, y: 0, z: 0 };
    shape.rot =
      shape.rot.x === null || shape.rot.y === null || shape.rot.z === null
        ? { x: 0, y: 0, z: 0 }
        : shape.rot;
    f.addBinding(shape, "rot", {
      label: "Rotation",
      x: { min: -180, max: 180, step: 1 },
      y: { min: -180, max: 180, step: 1 },
      z: { min: -180, max: 180, step: 1 },
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

export default RaymarchingUIWrapper;
