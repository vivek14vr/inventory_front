"use client";

import { useEffect } from "react";

/** Prevent mouse-wheel from changing focused `input[type="number"]` values. */
export function DisableNumberInputScroll() {
  useEffect(() => {
    function handleWheel(event: WheelEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.type === "number" &&
        document.activeElement === target
      ) {
        event.preventDefault();
      }
    }

    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  return null;
}
