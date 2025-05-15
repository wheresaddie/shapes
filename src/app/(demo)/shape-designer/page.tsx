"use client";
import { useEffect, useState } from "react";

import { invalidate, Canvas } from "@react-three/fiber";
import { EffectComposer, FXAA } from "@react-three/postprocessing";
import { OrthographicCamera } from "@react-three/drei";
import { ShaderMaterial } from "./material";
import NoSSR from "react-no-ssr";
import RaymarchingUI, { UiData } from "./ui";

function useWindowSize() {
  const [size, setSize] = useState({ innerWidth: 400, innerHeight: 400 });

  useEffect(() => {
    const handleResize = () => {
      setSize({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
      });
    };

    const debouncedHandleResize = debounce(handleResize, 250);
    window.addEventListener("resize", debouncedHandleResize);
    return () => window.removeEventListener("resize", debouncedHandleResize);
  }, []);

  return size;
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

export default function ShaderCanvas() {
  const { innerWidth, innerHeight } = useWindowSize();
  const [key, setKey] = useState(`${innerWidth}-${innerHeight}`);
  const [uiUniforms, setUniforms] = useState<UiData>();

  // The shaders tend to be brittle and tend to break when we
  // change the window size or the underlying shader material.
  //
  // To force rerenders, we use a unique key for the canvas
  // that changes whenever the window size changes.
  useEffect(() => {
    setKey(`${innerWidth}-${innerHeight}`);
    invalidate();
  }, [innerWidth, innerHeight, key]);

  return (
    <div className="bg-gray-100 w-full h-screen pr-[24rem] overflow-hidden">
      <div className="fixed top-0 right-0 h-screen w-[24rem] bg-gray-100 border-l border-gray-300 shadow-lg overflow-y-auto p-4">
        <RaymarchingUI setUniforms={setUniforms} />
      </div>
      <div className="pt-12 w-full flex justify-center h-full">
        <div className="w-[640px] flex flex-col h-full">
          <div className="h-[360px]">
            <NoSSR>
              <Canvas
                id="canvas"
                style={{
                  width: 640,
                  height: 360,
                  border: "1px solid #CCC",
                  boxShadow: "0 0 10px #CCC",
                }}
                camera={{ position: [0, 0, 1] }}
                key={key}
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
                  {uiUniforms && <ShaderMaterial uiUniforms={uiUniforms} />}
                  <EffectComposer multisampling={0}>
                    <FXAA />
                  </EffectComposer>
                </mesh>
              </Canvas>
            </NoSSR>
          </div>
          <div className="h-full flex-grow-0 overflow-y-auto mt-4">
            <h1>General Info</h1>
            <p>
              This is a raymarching shader. The interface to the right allows to
              modify the contents and behavior of the scene above. At the top
              there is a section that allows to export and import the current
              settings. The export button will automatically download a JSON
              file with the current settings. The import button will allow you
              to select a JSON file and load it into the scene.
            </p>
            <p>
              The global settings are settings that affect the entire scene.
            </p>
            <p>
              The shapes section allows to add, remove, and modify the shapes in
              the scene. You can choose a shape type, modify a variety of
              parameters, and assign a material to the shape.
            </p>
            <p>
              The materials section allows to add, remove, and modify different
              materials in the scene. There is a floor material and a default
              material. Each shape can have a different material assigned to it.
            </p>
            <p>
              The lights section allows to add, remove, and modify the lights in
              the scene. There is a default omni light that provides a base
              ambient illumination. You can also add point or directional
              lights.
            </p>
            <h1>Interface Notes</h1>
            <p>
              There are various types of inputs in the user interface. Buttons,
              sliders, and drop-downs are self-explanatory. Numerical inputs
              allow you to enter numbers with a keyboard, however, you can also
              press the up or down arrows to jump up or down an interval. There
              is also an adjacent handle that you can click and drag to change
              the values.
            </p>
            <p>
              The color inputs allow you to select a color using a color picker.
              You can also enter the color in rgb format.
            </p>
            <p>
              Finally, each folder can be clicked to open or close it to provide
              more space for easier editing.
            </p>
            <h1>Global Settings</h1>
            <h2>Max Rays</h2>
            <p>
              The number of ray bounces. This is needed for <i>reflections</i>{" "}
              and <i>refractions</i> effects. The larger the number the slower
              the performance.
            </p>
            <p>
              A good default value is between 10 and 16. This can be dynamically
              set for people with different performance requirements. I.e. we
              could have a performance dropdown that allows people to change
              between Low, Medium, and High Performance and this would be one of
              the variables that would change.
            </p>
            <h2>GI Length</h2>
            <p>
              This stands for Global Illumination length. It is how far a ray
              goes to determine global illumination. See <i>GI Strength</i> and{" "}
              <i>AO Strength</i> for more details.
            </p>
            <p>A good default value is 0.08.</p>
            <h2>GI Strength</h2>
            <p>
              This is for the strength of the global illumination. It determines
              how much light from adjacent objects light each other up. For
              example, in real life a red object will cast a slight red light on
              to an adjacent surface. If you make this value high you can give
              all objects a glow-like effect.
            </p>
            <p>A good default value is 0.08.</p>
            <h2>AO Strength</h2>
            <p>
              This is for the strength of the ambient occlusion. Essentially it
              creates a shadow when objects are nearby. Not a full shadow, but a
              shadow that is created by the occlusion of ambient light. For
              example, the convex corner of a shape will naturally appear darker
              even if light can reach it.
            </p>
            <p>A good default value is 0.20.</p>
            <h2>Camera Target</h2>
            <p>
              This is the target of the camera. It determines where the camera
              is looking at. The default value is 0,0,0 which means the camera
              is looking at the origin.
            </p>
            <h2>Camera Orbit Height</h2>
            <p>This is the height of the camera from the floor.</p>
            <h2>Camera Orbit Distance</h2>
            <p>This is the distance of the camera from the target.</p>
            <h2>Orbit</h2>
            <p>
              This is the speed of the camera revolving around the scene. When
              the speed is greater than 0 the camera will orbit around the
              target. When the speed is 0 you can move the camera by clicking on
              the image and dragging the mouse around.
            </p>
            <h1>Shapes</h1>
            <h2>Shape Type</h2>
            <p>
              You can assign a shape type via a dropdown. Shape types are:
              Sphere, Box, Round Box, Torus, Link, Cone, Hex Prism, Tri Prism,
              Capsule, Cylinder, Round Cylinder, Cut Cone, Solid Angle, Cut
              Sphere, Round Cone, Octahedron.
            </p>
            <h2>Position</h2>
            <p>
              The shape position. This may or may not be the center depending on
              the shape type.
            </p>
            <h2>Position</h2>
            <p>
              The shape position. This may or may not be the center depending on
              the shape type.
            </p>
            <h2>Rotation</h2>
            <p>
              This allows you to rotate the shape around the x, y, and z axes,
              respectively.
            </p>
            <h2>Material</h2>
            <p>
              This allows you to assign a material to the shape. The material
              can be one of the materials in the materials section. Adding or
              removing a material will automatically update the list.
            </p>
            <h2>Shape Properties</h2>
            <p>
              Each shape has a set of properties that are specific to the shape.
              If when creating a shape you cannot see it, it may be that one of
              these settings is set to zero.
            </p>
            <h1>Materials</h1>
            <h2>Name</h2>
            <p>
              The name of the material. This is used to identify the material in
              the shapes section. Make sure you name each material with a
              different name.
            </p>
            <h2>Color</h2>
            <p>
              This is the diffuse color of the shape. If the shape is not or
              partially reflective/transparent then this color will be visible.
            </p>
            <h2>Inner Color</h2>
            <p>
              This color is used for the inside of the shape when there is
              attenuation. The inside of the shape will be colored depending on
              the attenuation settings and how thick the material is.
            </p>
            <h2>Diffuse Strength</h2>
            <p>
              This is how strong the diffuse color is. This value is set to 1 by
              default but will vary depending on the material.
            </p>
            <h2>Index of Refraction</h2>
            <p>
              This is how <i>bendy</i> the light behaves in a transparent
              material. A value of 1 does not bend the light at all. Glass has a
              value of 1.5.
            </p>
            <h2>Reflectivity</h2>
            <p>
              This indicates how reflective an item is. A value of 0 is not
              reflective and a value of 1 is completely reflective. Note that a
              completely reflective item will appear mirror-like and will not
              retain any of its own colors or lighting.
            </p>
            <h2>Internal Reflection</h2>
            <p>
              Some complicated tranparent shapes can have internal refraction
              (for example, a cone does, but a sphere does not). This is when
              bounces around inside the shape. In some cases allowing internal
              refraction can create some interesting visuals. However, if the
              shape does not have internal refraction then it is best to uncheck
              this.
            </p>
            <h2>Roughness</h2>
            <p>
              This is a value that affects the roughness of the surface and how
              light behaves on it. The effect is more apparent the <i>less</i>
              reflective or transparent a surface is.
            </p>
            <h2>Reflect Roughness</h2>
            <p>
              This adds some noise to a reflection making the surface appear
              rougher. Low values are more realistic. Because this technique
              uses multiple rays it means that objects reflected may have less
              detail.
            </p>
            <h2>Refract Roughness</h2>
            <p>
              This adds some noise to the light entering a transparent object
              making the interior appear rougher. Low values are more realistic.
              Low values are more realistic. Because this technique uses
              multiple rays it means that objects seen through the object may
              have less detail.
            </p>
            <h2>Metallic</h2>
            <p>
              This is a value that affects the metallicity of the surface and
              how light behaves on it. The effect is more apparent the
              <i>less</i>
              reflective or transparent a surface is.
            </p>
            <h2>Transparency</h2>
            <p>
              This setting determines how transparent the object is. A fully
              transparent object will still be somewhat visible but it will
              retain less of its color qualities. There are edge cases in
              transparent objects where reflection may happen. Also, due to the
              way light may refract in an object you may have counter-intuitive
              visuals. Also, try enabling or disabling Internal Reflection to
              see a potentially different effect.
            </p>
            <h2>Attenuation and Attenuation Strength</h2>
            <p>
              These values work in tandem. They are also highly dependant on the
              dimensions of the shape. Set the inner color to a value different
              than the color and then try playing around with the values. Set
              the attenuation strength first and then move the attenuation
              slider. At a certain point the center of the object will be
              colored with the inner color giving it a milky/glowy feeling.
            </p>
            <h1>Lights</h1>
            <h2>Type</h2>
            <p>
              The light types that can be selected are POINT and DIRECTIONAL. A
              point light is a light that emanates in all directions from a
              single point. A directional light is a light without a specific
              source that goes in one direction (like from an infinite distance
              away).
            </p>
            <h2>Strength</h2>
            <p>
              This is the strength of the light. It applies to all light types.
            </p>
            <h2>Color</h2>
            <p>
              This is the color of the light. It applies to all light types.
            </p>
            <h2>Direction</h2>
            <p>
              This is the direction of the light. It only applies to directional
              lights.
            </p>
            <h2>Position</h2>
            <p>
              This is the position of the light. It only applies to point
              lights.
            </p>
            <h2>Ranged</h2>
            <p>
              This is whether the light has a specific range. This only applies
              to point lights.
            </p>
            <h2>Radius</h2>
            <p>
              This is radius of a ranged light. This only applies to point
              lights.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
