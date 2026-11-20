import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  side: "left" | "right";
  width: number;
  min: number;
  max: number;
  onWidth: (width: number) => void;
}

export function PaneResizer({ side, width, min, max, onWidth }: Props) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, w: 0 });

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - start.current.x;
      const next = side === "left" ? start.current.w + dx : start.current.w - dx;
      onWidth(Math.round(Math.min(max, Math.max(min, next))));
    };
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, side, min, max, onWidth]);

  const nudge = (delta: number) => {
    const signed = side === "left" ? delta : -delta;
    onWidth(Math.round(Math.min(max, Math.max(min, width + signed))));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "left" ? "调整题库栏宽度" : "调整讲解栏宽度"}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        start.current = { x: e.clientX, w: width };
        setDragging(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-16); }
        if (e.key === "ArrowRight") { e.preventDefault(); nudge(16); }
      }}
      className={cn(
        "group relative w-1.5 shrink-0 cursor-col-resize touch-none",
        dragging ? "bg-primary/25" : "hover:bg-primary/10",
      )}
    >
      <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2", dragging ? "bg-primary" : "bg-border group-hover:bg-primary/60")} />
      <span className={cn("absolute left-1/2 top-1/2 h-9 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full", dragging ? "bg-primary" : "bg-border group-hover:bg-primary")} />
    </div>
  );
}