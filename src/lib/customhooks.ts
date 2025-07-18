import { useRef } from "react";

export const useThrottle = () => {
  const throttleSeed = useRef<ReturnType<typeof setTimeout> | null>(null);

  const throttleFunction = useRef((func: any, delay = 200) => {
    if (!throttleSeed.current) {
      // Call the callback immediately for the first time
      func();
      throttleSeed.current = setTimeout(() => {
        throttleSeed.current = null;
      }, delay);
    }
  });

  return throttleFunction.current;
};

export const useDebounce = () => {
  const debounceSeed = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceFunction = useRef((func: any, delay = 200) => {
    if (debounceSeed.current) {
      clearTimeout(debounceSeed.current);
      debounceSeed.current = null;
    }
    debounceSeed.current = setTimeout(() => {
      func();
      debounceSeed.current = null;
    }, delay);
  });

  return debounceFunction.current;
};
