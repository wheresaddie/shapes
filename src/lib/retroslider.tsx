import React, { useState, useRef, useEffect } from "react";

interface RetroSliderProps {
  orientation?: "horizontal" | "vertical";
  onPositionChange?: (position: number) => void;
  className?: string;
  snapToCenter?: boolean;
  homePosition?: number; // Percentage (0-100) where slider starts and snaps back to
  value?: number; // Controlled value (displacement from home position, same format as onPositionChange)
}

const RetroSlider: React.FC<RetroSliderProps> = ({
  orientation = "horizontal",
  onPositionChange,
  className = "",
  snapToCenter = true,
  homePosition = 50, // Default to 50% (center)
  value, // Controlled value
}) => {
  // Clamp homePosition to valid range
  const homeValue = Math.max(0, Math.min(100, homePosition));
  const [internalPosition, setInternalPosition] = useState<number>(homeValue); // Internal state for uncontrolled mode
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartOffset, setDragStartOffset] = useState<number>(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  // Determine current position (controlled vs uncontrolled)
  const position =
    value !== undefined
      ? Math.max(0, Math.min(100, homeValue + value)) // Convert from displacement to absolute position
      : internalPosition;

  // Sync internal state when controlled value changes
  useEffect(() => {
    if (value !== undefined) {
      const newPosition = Math.max(0, Math.min(100, homeValue + value));
      setInternalPosition(newPosition);
    }
  }, [value, homeValue]);

  // Update position and notify parent
  const updatePositionState = (newPosition: number): void => {
    // Only update internal state if not controlled
    if (value === undefined) {
      setInternalPosition(newPosition);
    }

    if (onPositionChange) {
      // Return displacement from home position
      // At home: returns 0
      // At 0%: returns -homeValue
      // At 100%: returns (100 - homeValue)
      const displacement = newPosition - homeValue;
      onPositionChange(displacement);
    }
  };

  // Handle mouse down on the thumb
  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();

    if (!sliderRef.current) return;

    setIsDragging(true);

    const containerRect = sliderRef.current.getBoundingClientRect();

    // Calculate where the mouse is relative to the current thumb position
    let currentThumbPos: number;
    let mousePos: number;

    if (orientation === "vertical") {
      currentThumbPos = ((100 - position) / 100) * containerRect.height; // Invert for bottom = 0
      mousePos = e.clientY - containerRect.top;
      setDragStartOffset(mousePos - currentThumbPos);
    } else {
      currentThumbPos = (position / 100) * containerRect.width;
      mousePos = e.clientX - containerRect.left;
      setDragStartOffset(mousePos - currentThumbPos);
    }

    const handleMouseMove = (e: MouseEvent): void => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      let newPosition: number;

      if (orientation === "vertical") {
        const adjustedY = e.clientY - rect.top - dragStartOffset;
        // Invert Y so bottom = 0, top = 100
        newPosition = Math.max(
          0,
          Math.min(100, 100 - (adjustedY / rect.height) * 100)
        );
      } else {
        const adjustedX = e.clientX - rect.left - dragStartOffset;
        newPosition = Math.max(
          0,
          Math.min(100, (adjustedX / rect.width) * 100)
        );
      }

      updatePositionState(newPosition);
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
      setDragStartOffset(0);
      if (snapToCenter) {
        updatePositionState(homeValue);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Handle mouse down on the track (jump to position)
  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault();

    if (!sliderRef.current) return;

    const rect = sliderRef.current.getBoundingClientRect();
    let newPosition: number;

    if (orientation === "vertical") {
      const y = e.clientY - rect.top;
      // Invert Y so bottom = 0, top = 100
      newPosition = Math.max(0, Math.min(100, 100 - (y / rect.height) * 100));
    } else {
      const x = e.clientX - rect.left;
      newPosition = Math.max(0, Math.min(100, (x / rect.width) * 100));
    }

    updatePositionState(newPosition);
    setIsDragging(true);
    setDragStartOffset(0); // No offset since we jumped to exact click position

    // Set up mouse move and release handlers for continued dragging
    const handleMouseMove = (e: MouseEvent): void => {
      if (!sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      let newPosition: number;

      if (orientation === "vertical") {
        const adjustedY = e.clientY - rect.top - dragStartOffset;
        // Invert Y so bottom = 0, top = 100
        newPosition = Math.max(
          0,
          Math.min(100, 100 - (adjustedY / rect.height) * 100)
        );
      } else {
        const adjustedX = e.clientX - rect.left - dragStartOffset;
        newPosition = Math.max(
          0,
          Math.min(100, (adjustedX / rect.width) * 100)
        );
      }

      updatePositionState(newPosition);
    };

    const handleMouseUp = (): void => {
      setIsDragging(false);
      setDragStartOffset(0);
      if (snapToCenter) {
        updatePositionState(homeValue);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Cleanup on component unmount
  useEffect(() => {
    return (): void => {
      setIsDragging(false);
    };
  }, []);

  // Calculate fill style based on position and orientation
  const getFillStyle = (): React.CSSProperties => {
    const home: number = homeValue;
    if (orientation === "vertical") {
      // For vertical, invert positions since bottom = 0
      const visualPosition = 100 - position;
      const visualHome = 100 - home;

      if (visualPosition >= visualHome) {
        return {
          top: `${visualHome}%`,
          height: `${visualPosition - visualHome}%`,
        };
      } else {
        return {
          top: `${visualPosition}%`,
          height: `${visualHome - visualPosition}%`,
        };
      }
    } else {
      if (position >= home) {
        return {
          left: `${home}%`,
          width: `${position - home}%`,
        };
      } else {
        return {
          left: `${position}%`,
          width: `${home - position}%`,
        };
      }
    }
  };

  // Get container and track classes based on orientation
  const containerClasses: string =
    orientation === "vertical"
      ? "relative w-12 h-full cursor-pointer flex-shrink-0"
      : "relative h-12 cursor-pointer w-full";

  const trackClasses: string =
    orientation === "vertical"
      ? "absolute left-1/2 top-0 w-0.5 h-full bg-gray-200 -translate-x-1/2 rounded"
      : "absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -translate-y-1/2 rounded";

  const fillClasses: string =
    orientation === "vertical"
      ? "absolute left-1/2 w-0.5 bg-gray-300 -translate-x-1/2 rounded"
      : "absolute top-1/2 h-0.5 bg-gray-300 -translate-y-1/2 rounded";

  // Get thumb position style
  const getThumbStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: "absolute",
      background: "#CCC",
    };

    if (orientation === "vertical") {
      return {
        ...baseStyle,
        top: `${100 - position}%`, // Invert for bottom = 0
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    } else {
      return {
        ...baseStyle,
        left: `${position}%`,
        top: "50%",
        transform: "translate(-50%, -50%)",
      };
    }
  };

  return (
    <div
      className={`flex flex-col items-center justify-center bg-gray-100 ${className}`}
    >
      <div
        className={
          orientation === "vertical" ? "h-full flex justify-center" : "w-full"
        }
      >
        <div
          ref={sliderRef}
          className={containerClasses}
          onMouseDown={handleTrackMouseDown}
          style={{
            minWidth: orientation === "vertical" ? "48px" : "auto",
            maxWidth: orientation === "vertical" ? "48px" : "auto",
          }}
        >
          {/* Track */}
          <div className={trackClasses}></div>

          {/* Fill */}
          <div className={fillClasses} style={getFillStyle()}></div>

          {/* Thumb */}
          <div
            className={`w-4 h-4 rounded-xl bg-gray-400 border-gray-500 cursor-grab ${
              isDragging ? "cursor-grabbing" : ""
            } ${
              !isDragging && snapToCenter
                ? "transition-all duration-300 ease-out"
                : ""
            }`}
            style={getThumbStyle()}
            onMouseDown={handleThumbMouseDown}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default RetroSlider;
