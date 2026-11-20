import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadDataUrl } from "@/lib/image";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string;
  name?: string;
}

const MIN = 0.4;
const MAX = 6;

export function ImageLightbox({ open, onOpenChange, src, name }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open, src]);

  const zoom = useCallback((factor: number) => {
    setScale((s) => Math.min(MAX, Math.max(MIN, Number((s * factor).toFixed(3)))));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, zoom]);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-3 p-4">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">题目照片</DialogTitle>
          <DialogDescription className="text-xs">
            {name ?? "原图预览"} · 滚轮缩放，按住拖动平移
          </DialogDescription>
        </DialogHeader>
        <div
          ref={viewportRef}
          className="relative h-[52vh] min-h-[240px] overflow-hidden rounded-xl gw-inset"
          style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
          }}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
        >
          <img
            src={src}
            alt="题目照片放大预览"
            draggable={false}
            className="absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
            style={{
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              maxHeight: "52vh",
              maxWidth: "100%",
            }}
          />
          <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white">
            {Math.round(scale * 100)}%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => zoom(1 / 1.25)} aria-label="缩小">
            <ZoomOut /> 缩小
          </Button>
          <Button variant="outline" size="sm" onClick={() => zoom(1.25)} aria-label="放大">
            <ZoomIn /> 放大
          </Button>
          <Button variant="outline" size="sm" onClick={reset}>
            <Maximize /> 适应窗口
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => downloadDataUrl(src, name ?? "题目照片.jpg")}
          >
            <Download /> 下载图片
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}