"use client";
import { useCallback, useEffect, useRef, useState } from "react";

//import { invalidate, Canvas } from "@react-three/fiber";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, SMAA } from "@react-three/postprocessing";
import { RoughnessBlur } from "@/lib/roughnesspass";
import { OrthographicCamera } from "@react-three/drei";
import { ShaderMaterial } from "@/lib/material";
import NoSSR from "react-no-ssr";
import DataManager, {
  PerformanceMode,
  TemplateData,
  UiData,
  Version as DataManagerVersion,
} from "@/lib/datamanager";
import * as THREE from "three";
import RetroSlider from "@/lib/retroslider";
import { v4 as uuidv4 } from "uuid";
import { useDebounce, useThrottle } from "@/lib/customhooks";
import defaults from "./defaults.json";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import clsx from "clsx";
import TinyDropdown from "@/lib/tinydropdown";

const enum PageState {
  INITIAL = "initial",
  LOADING_DATA = "loadingData",
  DATA_LOADED = "dataLoaded",
  TESTING_PERFORMANCE = "testingPerformance",
  READY_TO_GENERATE = "readyToGenerate",
  GENERATING_BASE = "generatingBase",
  BASE_GENERATED = "baseGenerated",
  GENERATING_UPGRADES = "generatingUpgrades",
  UPGRADES_GENERATED = "upgradesGenerated",
  COMPLETE = "complete",
  RESET = "reset",
}

const enum PerformanceTestState {
  INITIAL = "initial",
  SETTING = "setting",
  SET = "set",
}

const pageLabels = {
  loadingData: "Loading Data",
  testingPerformance: "Testing Performance",
  generatingBase: "Generating Sculpture",
  generatingUpgrades: "Upgrading Sculpture",
  reset: "Resetting",
};

export default function ShaderCanvas() {
  const [shapesUpdated, setShapesUpdated] = useState(0);
  const [materialsUpdated, setMaterialsUpdated] = useState(0);
  const [performanceSettingsUpdated, setPerformanceSettingsUpdated] =
    useState(0);
  const [perfUpdated, setPerfUpdate] = useState(0);
  const [globalsUpdated, setGlobalsUpdated] = useState(0);
  const [templateVariables, setTemplateVariables] = useState<TemplateData>();
  const [surfaceBlur, setSurfaceBlur] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const raf = useRef<string | null>(null);
  const currentOrbit = useRef(0);
  const throttleOrbit = useThrottle();
  const throttleInteract = useThrottle();
  const throttleFps = useThrottle();
  const router = useRouter();
  const routerRef = useRef(router);
  const params = useParams();
  const searchParams = useSearchParams();
  const [dataManager, setDataManager] = useState<DataManager | null>(null);
  const upgrades = parseInt(searchParams.get("upgrades") ?? "0");
  const sculptureId = params.id;
  const [pageState, setPageState] = useState<PageState>(PageState.INITIAL);
  const generationStateRef = useRef(pageState);
  const [compiled, setCompiled] = useState(false);
  const versionMismatch = useRef(false);
  const compiledRef = useRef(compiled);
  const dotRef = useRef(0);
  const [orbit, setOrbit] = useState(10);
  const timeRef = useRef(30000);
  const [dangerZone, setDangerZone] = useState(false);
  const interactingTimeoutRef =
    useRef<ReturnType<typeof setTimeout>>(undefined);
  const interactingRef = useRef(false);
  const deltaRef = useRef<number>(undefined);
  const [performanceTestState, setPerformanceTestState] =
    useState<PerformanceTestState>(PerformanceTestState.INITIAL);
  const performanceTestStateRef = useRef(performanceTestState);
  const [perf, setPerf] = useState<PerformanceMode | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [showInterface, setShowInterface] = useState(false);
  const debounceMouseMove = useDebounce();

  const options = [
    { label: "Good", value: PerformanceMode.GOOD },
    { label: "Better", value: PerformanceMode.BETTER },
    { label: "Best", value: PerformanceMode.BEST },
  ];

  const mouseMoved = useCallback(() => {
    setShowInterface(true);
    debounceMouseMove(() => {
      setShowInterface(false);
    }, 5000);
  }, [debounceMouseMove]);

  useEffect(() => {
    document.addEventListener("mousemove", mouseMoved);
    return () => {
      document.removeEventListener("mousemove", mouseMoved);
    };
  }, [mouseMoved]);

  useEffect(() => {
    if (dataManager?.data.current.globals && sculptureId && selected) {
      const perf = PerformanceMode[selected as keyof typeof PerformanceMode];
      setPerf(perf);
      const savedDataString = localStorage.getItem(sculptureId as string);
      if (savedDataString) {
        if (sculptureId == "infinite") {
          const savedData = JSON.parse(savedDataString);
          localStorage.setItem(
            sculptureId,
            JSON.stringify({
              perf,
              version: savedData ? savedData.version : DataManagerVersion,
            })
          );
        } else {
          localStorage.setItem(
            sculptureId as string,
            JSON.stringify(dataManager.getData().current)
          );
        }
      }
      dataManager.data.current.globals.perf = perf;
      dataManager.recompileShader();
      dataManager.updateAllUniforms();
    }
  }, [selected, dataManager, sculptureId]);

  const doDot = useCallback((time: number) => {
    Array.from(document.getElementsByClassName("dot-1")).forEach((el) => {
      (el as HTMLElement).style.opacity = dotRef.current <= 0 ? "0" : "1";
    });
    Array.from(document.getElementsByClassName("dot-2")).forEach((el) => {
      (el as HTMLElement).style.opacity = dotRef.current <= 1 ? "0" : "1";
    });
    Array.from(document.getElementsByClassName("dot-3")).forEach((el) => {
      (el as HTMLElement).style.opacity = dotRef.current <= 2 ? "0" : "1";
    });

    dotRef.current = Math.floor(time / 250) % 4;

    if (generationStateRef.current != PageState.COMPLETE) {
      requestAnimationFrame((time) => doDot(time));
    }
  }, []);

  useEffect(() => {
    setDataManager(
      new DataManager(
        setTemplateVariables,
        setShapesUpdated,
        setMaterialsUpdated,
        setPerformanceSettingsUpdated,
        setPerfUpdate,
        setGlobalsUpdated
      )
    );
  }, [
    setTemplateVariables,
    setShapesUpdated,
    setMaterialsUpdated,
    setPerformanceSettingsUpdated,
    setPerfUpdate,
    setGlobalsUpdated,
  ]);

  const easeOrbit = useCallback(
    (time: number, delta: number, uuid: string | null, orbit: number) => {
      if (
        (Math.abs(orbit) <= 0.01 &&
          Math.abs(currentOrbit.current - orbit) < 0.01) ||
        uuid !== raf.current
      ) {
        if (
          Math.abs(orbit) <= 0.01 &&
          Math.abs(currentOrbit.current - orbit) < 0.01
        ) {
          currentOrbit.current = 0;
          if (dataManager?.data.current.globals) {
            dataManager.data.current.globals.camHAngle +=
              currentOrbit.current * (delta / 1000);
            setGlobalsUpdated((prev) => prev + 1);
          }
          raf.current = null;
        }
      } else {
        currentOrbit.current = orbit * 0.1 + 0.9 * currentOrbit.current;
        if (dataManager?.data.current.globals) {
          dataManager.data.current.globals.camHAngle +=
            currentOrbit.current * (delta / 1000);
          setGlobalsUpdated((prev) => prev + 1);
        }
        requestAnimationFrame((newTime: number) => {
          easeOrbit(newTime, newTime - time, uuid, orbit);
        });
      }
    },
    [dataManager]
  );

  const getDelta = useCallback(
    (time: number, previousTime: number) => {
      if (deltaRef.current === undefined && previousTime != time) {
        deltaRef.current = time - previousTime;
      } else if (deltaRef.current !== undefined && previousTime != time) {
        deltaRef.current =
          deltaRef.current * 0.95 + (time - previousTime) * 0.05;
      }
      if (
        performanceTestStateRef.current == PerformanceTestState.SETTING ||
        sculptureId != "infinite"
      ) {
        requestAnimationFrame((newTime) => getDelta(newTime, time));
      }
      if (sculptureId != "infinite") {
        throttleFps(() => {
          document.getElementById("fps")!.innerHTML = (
            1000 / deltaRef.current!
          ).toFixed(2);
        }, 50);
      }
    },
    [sculptureId, throttleFps]
  );

  useEffect(() => {
    performanceTestStateRef.current = performanceTestState;
    if (
      performanceTestState == PerformanceTestState.SETTING ||
      sculptureId != "infinite"
    ) {
      requestAnimationFrame((time) => getDelta(time, time));
    }
  }, [performanceTestState, getDelta, sculptureId]);

  const resetTimer = useCallback((time: number, delta: number) => {
    const newDelta = interactingRef.current ? delta / 10 : delta;
    timeRef.current = Math.max(0, timeRef.current - newDelta);
    if (timeRef.current < 5000) {
      setDangerZone(true);
    }

    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.innerHTML = (timeRef.current / 1000).toFixed(2);
    }

    if (timeRef.current <= 0) {
      setPageState(PageState.RESET);
    } else {
      requestAnimationFrame((newTime: number) => {
        resetTimer(newTime, newTime - time);
      });
    }
  }, []);

  useEffect(() => {
    generationStateRef.current = pageState;

    if (dataManager) {
      if (pageState === PageState.INITIAL) {
        if (sculptureId) {
          const savedDataString = localStorage.getItem(sculptureId as string);

          if (savedDataString) {
            try {
              const savedData = JSON.parse(savedDataString);
              versionMismatch.current =
                !!savedData && savedData.version != DataManagerVersion;

              if (sculptureId != "infinite") {
                dataManager.setData(savedData);
                setSelected(dataManager.data.current.globals.perf);
                setPageState(PageState.COMPLETE);
              }
            } catch (err) {
              versionMismatch.current = !!err;
            }
          }

          if (
            !savedDataString ||
            versionMismatch.current ||
            sculptureId == "infinite"
          ) {
            if (sculptureId != "infinite") {
              defaults.generationSettings.sculptureId = sculptureId as string;
            }
            dataManager.setData(defaults as UiData);
            setPageState(PageState.DATA_LOADED);
            requestAnimationFrame((time) => doDot(time));
          }
        }
      } else if (pageState == PageState.DATA_LOADED) {
        if (compiledRef.current) {
          const savedData = localStorage.getItem(sculptureId as string);
          if (
            sculptureId == "infinite" &&
            savedData &&
            !versionMismatch.current
          ) {
            setSelected(savedData);
            setPageState(PageState.READY_TO_GENERATE);
          } else {
            setPageState(PageState.TESTING_PERFORMANCE);
          }
        }
      } else if (pageState == PageState.TESTING_PERFORMANCE) {
        setPerformanceTestState(PerformanceTestState.SETTING);
        if (compiledRef.current) {
          setTimeout(() => {
            let fps = Math.floor(1000 / deltaRef.current!);
            if (fps > 50) {
              setSelected(PerformanceMode.BETTER);
              setTimeout(() => {
                fps = Math.floor(1000 / deltaRef.current!);
                if (fps > 50) {
                  setSelected(PerformanceMode.BEST);
                  setTimeout(() => {
                    fps = Math.floor(1000 / deltaRef.current!);
                    if (fps > 50) {
                    } else {
                      setSelected(PerformanceMode.BETTER);
                    }
                    setPageState(PageState.READY_TO_GENERATE);
                  }, 3000);
                } else {
                  setSelected(PerformanceMode.GOOD);
                  setPageState(PageState.READY_TO_GENERATE);
                }
              }, 3000);
            } else {
              setPageState(PageState.READY_TO_GENERATE);
            }
          }, 5000);
        }
      } else if (pageState == PageState.READY_TO_GENERATE) {
        setCompiled(false);
        setPageState(PageState.GENERATING_BASE);
        dataManager.data.current.globals.camVAngle = 1.26;
        setGlobalsUpdated((prev) => prev + 1);
      } else if (pageState == PageState.GENERATING_BASE) {
        if (sculptureId == "infinite") {
          dataManager.data.current.generationSettings!.sculptureId = uuidv4();
          const newParams = new URLSearchParams();
          newParams.set(
            "id",
            dataManager.data.current.generationSettings!.sculptureId
          );
          routerRef.current.push(`?${newParams.toString()}`);
        }
        dataManager.generateBaseSculpture().then(() => {
          setPageState(PageState.BASE_GENERATED);
        });
      } else if (pageState == PageState.BASE_GENERATED) {
        if (upgrades > 0) {
          setPageState(PageState.GENERATING_UPGRADES);
        } else if (compiledRef.current) {
          setPageState(PageState.COMPLETE);
        }
      } else if (pageState == PageState.GENERATING_UPGRADES) {
        (async () => {
          for (let i = 0; i < upgrades; i++) {
            await dataManager.upgradeSculpture();
          }
          setPageState(PageState.UPGRADES_GENERATED);
        })();
      } else if (pageState == PageState.UPGRADES_GENERATED) {
        if (compiledRef.current) {
          setPageState(PageState.COMPLETE);
        }
      } else if (pageState == PageState.COMPLETE) {
        if (sculptureId != "infinite") {
          localStorage.setItem(
            sculptureId as string,
            JSON.stringify(dataManager.getData().current)
          );
        } else {
          localStorage.setItem(
            sculptureId,
            JSON.stringify({
              perf: dataManager.data.current.globals.perf,
              version: DataManagerVersion,
            })
          );
        }
        versionMismatch.current = false;
        if (raf.current == null) {
          requestAnimationFrame((time) => {
            raf.current = uuidv4();
            easeOrbit(time, 1000 / 60, raf.current, 0.2);
          });
        }

        timeRef.current = 30000;
        setDangerZone(false);
        if (sculptureId == "infinite") {
          requestAnimationFrame((time: number) => {
            resetTimer(time, 0);
          });
        }
      } else if (pageState == PageState.RESET) {
        setTimeout(() => {
          requestAnimationFrame((time) => doDot(time));
          setPageState(PageState.READY_TO_GENERATE);
        }, 1000);
      }
    }
  }, [
    pageState,
    dataManager,
    sculptureId,
    easeOrbit,
    resetTimer,
    upgrades,
    doDot,
  ]);

  useEffect(() => {
    compiledRef.current = compiled;
    if (generationStateRef.current == PageState.DATA_LOADED && compiled) {
      const savedDataString = localStorage.getItem(sculptureId as string);
      if (
        savedDataString &&
        sculptureId == "infinite" &&
        !versionMismatch.current
      ) {
        let perf = "GOOD";
        try {
          const savedData = JSON.parse(savedDataString);
          if (savedData.perf == "LOW") perf = "GOOD";
          if (savedData.perf == "MEDIUM") perf = "BETTER";
          if (savedData.perf == "HIGH") perf = "BEST";
          setSelected(perf);
          setPageState(PageState.READY_TO_GENERATE);
        } catch (err) {
          if (err) {
            setPageState(PageState.TESTING_PERFORMANCE);
          }
        }
      } else {
        setPageState(PageState.TESTING_PERFORMANCE);
      }
    }
  }, [compiled, upgrades, sculptureId]);

  useEffect(() => {
    if (dataManager) {
      setSurfaceBlur(
        dataManager.data.current.performanceSettings[
          dataManager.data.current.globals.perf
        ].surfaceBlur
      );
      setShowDebug(dataManager.data.current.globals.showDebug);
    }
  }, [dataManager, globalsUpdated, performanceSettingsUpdated]);

  const interact = useCallback(() => {
    interactingRef.current = true;
    clearTimeout(interactingTimeoutRef.current);
    interactingTimeoutRef.current = setTimeout(() => {
      interactingRef.current = false;
    }, 1000);
  }, []);

  return (
    <div className="bg-gray-100 w-full h-screen overflow-hidden">
      <div className="w-full flex justify-center items-center h-full -mt-4">
        <div className="flex flex-col">
          <div
            className={`flex flex-row w-[640px] text-[9px] uppercase text-gray-400 tracking-widest underline underline-offset-2 justify-around self-center mb-2
              transition-[opacity] duration-1000 ${clsx({
                "opacity-0": pageState != PageState.COMPLETE || !showInterface,
              })}`}
          >
            <div
              className="cursor-pointer"
              onClick={() => {
                throttleInteract(interact, 100);
                if (dataManager?.data.current.globals) {
                  dataManager.data.current.globals.camHAngle = 0.0;
                  dataManager.data.current.globals.camVAngle = 1.3;
                  dataManager.data.current.globals.camDist = 0.9;
                }
                setGlobalsUpdated((prev) => prev + 1);
                raf.current = null;
                setOrbit(0);
              }}
            >
              View 1
            </div>
            <div
              className="cursor-pointer"
              onClick={() => {
                throttleInteract(interact, 100);
                if (dataManager?.data.current.globals) {
                  dataManager.data.current.globals.camHAngle = 2.1;
                  dataManager.data.current.globals.camVAngle = 1.3;
                  dataManager.data.current.globals.camDist = 1.2;
                }
                setGlobalsUpdated((prev) => prev + 1);
                raf.current = null;
                setOrbit(0);
              }}
            >
              View 2
            </div>
            <div
              className="cursor-pointer"
              onClick={() => {
                throttleInteract(interact, 100);
                if (dataManager?.data.current.globals) {
                  dataManager.data.current.globals.camHAngle = 4.2;
                  dataManager.data.current.globals.camVAngle = 1.0;
                  dataManager.data.current.globals.camDist = 0.7;
                }
                setGlobalsUpdated((prev) => prev + 1);
                raf.current = null;
                setOrbit(0);
              }}
            >
              View 3
            </div>
            <div
              className="cursor-pointer"
              onClick={() => {
                throttleInteract(interact, 100);
                if (dataManager?.data.current.globals) {
                  dataManager.data.current.globals.camHAngle = -0.5;
                  dataManager.data.current.globals.camVAngle = 0.5;
                  dataManager.data.current.globals.camDist = 0.8;
                }
                setGlobalsUpdated((prev) => prev + 1);
                raf.current = null;
                setOrbit(0);
              }}
            >
              View 4
            </div>
          </div>
          <div className="flex flex-row h-[360px]">
            <RetroSlider
              orientation="vertical"
              className={`py-8 transition-[opacity] duration-1000 ${clsx({
                "opacity-0": pageState != PageState.COMPLETE || !showInterface,
              })}`}
              snapToCenter={false}
              homePosition={25}
              value={
                dataManager?.data.current.globals
                  ? ((dataManager.data.current.globals.camVAngle - 1.67) /
                      1.62) *
                      -100 -
                    25
                  : 0
              }
              onPositionChange={(position) => {
                throttleInteract(interact, 100);
                if (dataManager?.data.current.globals) {
                  dataManager.data.current.globals.camVAngle =
                    1.67 - ((position + 25) / 100) * 1.62;
                }
                setGlobalsUpdated((prev) => prev + 1);
              }}
            />
            <div className="w-[640px] flex flex-col h-full">
              <div className="h-[360px] relative">
                <div
                  className={`w-[640px] h-[360px] bg-gray-200 absolute left-0 top-0 z-20 border-[1px] border-gray-200 shadow-[0_0_10px_#CCC] flex justify-center items-center text-gray-400 uppercase text-xs transition-[opacity] duration-1000 ${clsx(
                    {
                      "opacity-0": pageState == PageState.COMPLETE,
                    }
                  )}`}
                >
                  <div>
                    <span>
                      {pageState in pageLabels
                        ? pageLabels[pageState as keyof typeof pageLabels]
                        : compiled
                        ? ""
                        : "Compiling"}
                    </span>

                    {(pageState in pageLabels || !compiled) && (
                      <>
                        <span className="dot-1">.</span>
                        <span className="dot-2">.</span>
                        <span className="dot-3">.</span>
                      </>
                    )}
                  </div>
                </div>
                <NoSSR>
                  <Canvas
                    id="canvas"
                    className={`border-[1px] border-gray-300 shadow-[0_0_10px_#CCC] transition-[opacity] duration-1000 ${clsx(
                      { "opacity-0": pageState != PageState.COMPLETE }
                    )}`}
                    style={{
                      width: 640,
                      height: 360,
                    }}
                    camera={{ position: [0, 0, 1] }}
                    //key={key}
                    gl={{
                      antialias: false, // Disable default antialias as we're using SMAA
                    }}
                    onCreated={async (state) => {
                      const { gl, scene, camera } = state;
                      await gl.compileAsync(scene, camera); // Compiles all materials
                    }}
                  >
                    <OrthographicCamera
                      makeDefault
                      left={-1}
                      right={1}
                      top={1}
                      bottom={-1}
                      near={0.1}
                      far={1000}
                      position={[0, 0, 1]}
                    />
                    <mesh scale={[2, 2, 1]}>
                      <planeGeometry />
                      {dataManager && templateVariables && (
                        <ShaderMaterial
                          dataRef={dataManager.data}
                          shapesUpdated={shapesUpdated}
                          materialsUpdated={materialsUpdated}
                          perfUpdated={perfUpdated}
                          performanceSettingsUpdated={
                            performanceSettingsUpdated
                          }
                          globalsUpdated={globalsUpdated}
                          templateVariables={templateVariables}
                          setCompiled={setCompiled}
                          devMode={false}
                        />
                      )}
                    </mesh>
                    <EffectComposer
                      multisampling={0}
                      frameBufferType={THREE.FloatType}
                    >
                      <SMAA />
                      {surfaceBlur && !showDebug ? (
                        <RoughnessBlur blurRadius={15} normalSensitivity={10} />
                      ) : (
                        <></>
                      )}
                    </EffectComposer>
                  </Canvas>
                </NoSSR>
              </div>
              <div
                className={`p-0 transition-[opacity] duration-1000 relative ${clsx(
                  {
                    "opacity-0": pageState != PageState.COMPLETE,
                  }
                )}`}
              >
                <div
                  className={`absolute top-0 left-0 h-12 flex flex-col items-start justify-start font-mono text-xs mt-2 transition-[opacity] duration-1000 z-20 
                    ${clsx({
                      "opacity-0": !showInterface,
                    })}
                `}
                >
                  <div className="text-[8px]">QUALITY</div>
                  <div>
                    <TinyDropdown
                      value={perf as string}
                      onChange={setSelected}
                      options={options}
                    />
                  </div>
                </div>
                <RetroSlider
                  className={`px-[72px] transition-[opacity] duration-1000
                    ${clsx({
                      "opacity-0": !showInterface,
                    })}
                  `}
                  value={orbit}
                  onPositionChange={(position) => {
                    throttleInteract(interact, 100);
                    setOrbit(position);
                    requestAnimationFrame((time: number) => {
                      if (position == 0) {
                        raf.current = uuidv4();
                        easeOrbit(time, 1000 / 60, raf.current, position / 50);
                      } else {
                        throttleOrbit(() => {
                          raf.current = uuidv4();
                          easeOrbit(
                            time,
                            1000 / 60,
                            raf.current,
                            position / 50
                          );
                        }, 50);
                      }
                    });
                  }}
                  snapToCenter={false}
                />
                {params.id == "infinite" && (
                  <div className="absolute top-0 right-0 h-12 flex flex-col items-end justify-start font-mono text-xs mt-2">
                    <div className="text-[8px]">TIME LEFT</div>
                    <div
                      className={`text-[10px] ${clsx({
                        "animate-halfpulse text-red-600": dangerZone,
                      })}`}
                      id="timer"
                    ></div>
                  </div>
                )}
                {params.id != "infinite" && (
                  <div
                    className={`absolute top-0 right-0 h-12 flex flex-col items-end justify-start font-mono text-xs mt-2 transition-[opacity] duration-1000
                    ${clsx({
                      "opacity-0": !showInterface,
                    })}
                  `}
                  >
                    <div className="text-[8px]">FPS</div>
                    <div id="fps">60</div>
                  </div>
                )}
              </div>
              {/*
                <div
                  className={`mt-10 flex flex-col items-center text-xs w-[640px] transition-[opacity] duration-1000 ${clsx(
                    { "opacity-0": generationState != PageState.COMPLETE }
                  )}`}
                >
                  {dataManager && (
                    <pre>
                      &laquo;{" "}
                      <CaptionFromSeed
                        seed={dataManager?.generationSettings.sculptureId}
                      />{" "}
                      &raquo;
                    </pre>
                  )}
                </div>
              */}
            </div>
            <RetroSlider
              orientation="vertical"
              className={`py-8 transition-[opacity] duration-1000 ${clsx({
                "opacity-0": pageState != PageState.COMPLETE || !showInterface,
              })}`}
              snapToCenter={false}
              value={
                dataManager?.data.current.globals
                  ? ((dataManager.data.current.globals.camDist - 0.5) / 0.8) *
                      100 -
                    50
                  : 0
              }
              onPositionChange={(position) => {
                throttleInteract(interact, 100);
                if (dataManager?.data.current.globals) {
                  dataManager.data.current.globals.camDist =
                    0.5 + ((position + 50) / 100) * 0.8;
                }
                setGlobalsUpdated((prev) => prev + 1);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
