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
const MAX = 8;
const clampScale = (value: number) => Math.min(MAX, Math.max(MIN, Number(value.toFixed(3))));

export function ImageLightbox({ open, onOpenChange, src, name }: Props) {
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setView({ scale: 1, x: 0, y: 0 });
  }, [open, src]);

  // 滚轮缩放以指针为锚点。弹层内容由 Portal 延迟挂载，元素级监听会因 ref 尚未就绪而丢失，
// 因此挂窗口捕获阶段，按事件目标是否落在弹层内过滤。
  useEffect(() => {
    if (!open) return;
    const onWheel = (e: WheelEvent) => {
      const content = contentRef.current ?? document.querySelector('[role="dialog"][data-state="open"]');
      if (!content || !(e.target instanceof Node) || !content.contains(e.target)) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      const factor = Math.exp(-e.deltaY * 0.0015);
      setView((v) => {
        const scale = clampScale(v.scale * factor);
        if (scale === v.scale) return v;
        const k = scale / v.scale;
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [open]);

  const zoomBy = useCallback((factor: number) => {
    setView((v) => {
      const scale = clampScale(v.scale * factor);
      const k = scale / v.scale;
      return { scale, x: v.x * k, y: v.y * k };
    });
  }, []);

  const reset = () => setView({ scale: 1, x: 0, y: 0 });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={contentRef} className="max-w-5xl gap-3 p-4">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">题目照片</DialogTitle>
          <DialogDescription className="text-xs">
            {name ?? "原图预览"} · 滚轮缩放，按住拖动平移，双击复位
          </DialogDescription>
        </DialogHeader>
        <div
          ref={viewportRef}
          className="relative h-[52vh] min-h-[240px] overflow-hidden rounded-xl gw-inset"
          style={{ cursor: dragRef.current ? "grabbing" : "grab", touchAction: "none" }}
          onDoubleClick={reset}
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            dragRef.current = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d) return;
            setView((v) => ({ ...v, x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
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
              transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              maxHeight: "52vh",
              maxWidth: "100%",
            }}
          />
          <span className="absolute bottom-2 right-2 rounded bg-black/55 px-2 py-0.5 font-mono text-[11px] text-white">
            {Math.round(view.scale * 100)}%
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => zoomBy(1 / 1.25)} aria-label="缩小">
            <ZoomOut /> 缩小
          </Button>
          <Button variant="outline" size="sm" onClick={() => zoomBy(1.25)} aria-label="放大">
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