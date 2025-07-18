import { forwardRef, Ref, useEffect, useLayoutEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { RoughnessBlurEffect } from "./roughness";

export interface RoughnessBlurProps {
  blurRadius: number;
  normalSensitivity: number;
}

export const RoughnessBlur = forwardRef<
  RoughnessBlurEffect,
  RoughnessBlurProps
>(function RoughnessBlur(
  { ...props }: RoughnessBlurProps,
  ref: Ref<RoughnessBlurEffect>
) {
  const invalidate = useThree((state) => state.invalidate);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { blurRadius, normalSensitivity } = props;
  const effect = useMemo(() => {
    return new RoughnessBlurEffect();
  }, []);

  useLayoutEffect(() => {
    invalidate();
    effect.blurRadius = blurRadius;
  }, [blurRadius, effect, invalidate]);

  useLayoutEffect(() => {
    invalidate();
    effect.normalSensitivity = normalSensitivity;
  }, [normalSensitivity, effect, invalidate]);

  useEffect(() => {
    return () => {
      effect.dispose = RoughnessBlurEffect.prototype.dispose;
      effect.dispose();
    };
  }, [effect]);

  return <primitive ref={ref} object={effect} dispose={null} />;
});
