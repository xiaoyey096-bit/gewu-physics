import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { downloadDataUrl } from "@/lib/image";
import { drawScene, type Palette } from "@/lib/renderer";
import type { Problem, SolveResult, StageOptions } from "@/lib/types";

export function VideoExport({ problem, result, palette, options, speed }: { problem: Problem; result: SolveResult; palette: Palette; options: StageOptions; speed: number }) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(speed);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const job = useRef<AbortController | null>(null);
  const busy = progress !== null;
  const duration = result.duration / rate;
  useEffect(() => () => job.current?.abort(), []);
  const cancel = () => { job.current?.abort(); job.current = null; setProgress(null); setMessage("已取消，未生成文件。"); };
  const start = async () => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setMessage("");
    setProgress(0);
    try {
      const { encodeMp4 } = await import("@/lib/video");
      controller.signal.throwIfAborted();
      const canvas = document.createElement("canvas");
      canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法创建视频画布");
      const blob = await encodeMp4(canvas, duration, fraction => {
        drawScene(ctx, canvas.width, canvas.height, { problem, result, time: fraction * result.duration }, palette, options);
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = palette.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = palette.muted;
        ctx.font = "12px sans-serif";
        ctx.fillText(`格物 · ${rate}× 演示 · ${problem.template === "projectile" ? "完整运动（不含碰撞）" : "完整运动"}`, 20, canvas.height - 12);
      }, value => { if (!controller.signal.aborted) setProgress(value); }, controller.signal);
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      downloadDataUrl(url, `格物-完整运动-${Date.now()}.mp4`);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setMessage("MP4 已生成并下载：1280 × 720，30 fps，无音轨。");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "视频导出失败，请重试。");
    } finally {
      if (job.current === controller) { job.current = null; setProgress(null); }
    }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && job.current) cancel(); if (value) { setRate(speed); setMessage(""); } setOpen(value); }}>
    <DialogTrigger asChild><Button variant="outline" size="xs"><Film />导出视频</Button></DialogTrigger>
    <DialogContent aria-modal="true" className="max-h-[85dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>导出 MP4 视频</DialogTitle><DialogDescription>{problem.template === "projectile" ? "从出发到落地前逐帧计算，不录制屏幕，不改变当前动画。导出期间使用开始时的题目、参数和显示设置。" : "按当前参数逐帧计算完整运动过程，不录制屏幕，不改变当前动画。导出期间使用开始时的题目、参数和显示设置。"}</DialogDescription></DialogHeader>
      <label className="flex items-center gap-3 text-sm">视频倍速<select aria-label="视频倍速" className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-slate-900" disabled={busy} value={rate} onChange={event => setRate(Number(event.target.value))}>{[0.25, 0.5, 1, 2, 5, 10, 20].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
      <p className="text-xs leading-6 text-muted-foreground">物理时长 {result.duration.toFixed(2)} s · 视频约 {duration.toFixed(2)} s<br />H.264 MP4 · 720p · 30 fps · 本地生成，无音轨。</p>
      {!(duration > 0 && duration <= 120) && <p className="text-xs text-destructive">{duration <= 0 ? "当前运动时长为零，请导出状态 PNG。" : "视频最长支持 120 秒，请提高视频倍速。"}</p>}
      {busy && <div className="space-y-2"><progress className="w-full" aria-label="视频导出进度" value={progress} max={100} /><p className="text-xs">正在逐帧编码 {progress}%</p></div>}
      {message && <p role="status" className="text-xs leading-6">{message}</p>}
      <div className="flex justify-end gap-2">{busy ? <Button variant="outline" onClick={cancel}>取消导出</Button> : <Button onClick={() => void start()} disabled={!(duration > 0 && duration <= 120)}>开始导出 MP4</Button>}</div>
    </DialogContent>
  </Dialog>;
}
