"use client";

import { useEffect, useRef, useState } from "react";
import { getWorkloadLogs, type LogLineDTO } from "@/lib/api/logs";
import type { EnvironmentScope } from "@/lib/api/projects";

const LOG_POLL_MS    = 3_000;
const DRIP_HISTORY  = 50;  // ms per line for initial history load
const DRIP_LIVE     = 80;  // ms per line for new lines arriving from polls

function streamColor(stream: "stdout" | "stderr" | string) {
  return stream === "stderr" ? "text-red-400/75" : "text-white/60";
}

type RichLine = LogLineDTO & { _key: string };

export function LogViewer({
  workloadId,
  projectID,
  scope,
}: {
  workloadId: string;
  projectID: string;
  scope?: EnvironmentScope;
}) {
  const containerRef    = useRef<HTMLDivElement>(null);
  const bottomRef       = useRef<HTMLDivElement>(null);
  const [lines, setLines]               = useState<RichLine[]>([]);
  const [displayedCount, setDisplayedCount] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [isScrolling, setIsScrolling]   = useState(false);
  const autoScroll    = useRef(true);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);
  const dripTimer     = useRef<NodeJS.Timeout | null>(null);
  // how many lines existed at last "settled" snapshot (drip complete)
  const settledAt     = useRef(0);

  // Reveal history instantly; drip only live lines one-by-one
  useEffect(() => {
    const target = lines.length;
    if (target <= displayedCount) return;

    if (dripTimer.current) clearInterval(dripTimer.current);

    // First load vs live poll — use appropriate rate
    const rate = settledAt.current === 0 ? DRIP_HISTORY : DRIP_LIVE;

    dripTimer.current = setInterval(() => {
      setDisplayedCount((prev: number) => {
        const next = prev + 1;
        if (next >= target) {
          clearInterval(dripTimer.current!);
          dripTimer.current = null;
          settledAt.current = target;
        }
        return next;
      });
    }, rate);

    return () => {
      if (dripTimer.current) {
        clearInterval(dripTimer.current);
        dripTimer.current = null;
      }
    };
  }, [lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll as each line drips in
  useEffect(() => {
    if (autoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displayedCount]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLines([]);
    setDisplayedCount(0);
    settledAt.current = 0;
    autoScroll.current = true;

    const poll = () => {
      getWorkloadLogs(projectID, workloadId, 200, scope)
        .then((res: { lines: LogLineDTO[] }) => {
          if (cancelled) return;
          const incoming = res.lines ?? [];
          setLines(
            incoming.map((l: LogLineDTO, i: number) => ({
              ...l,
              _key: `${i}-${l.id}-${l.ts}`,
            }))
          );
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    };

    poll();
    const id = setInterval(poll, LOG_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      if (dripTimer.current) clearInterval(dripTimer.current);
    };
  }, [workloadId, projectID, scope]);

  const visibleLines = lines.slice(0, displayedCount);

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-y-auto bg-[#040404] font-mono text-[11px] leading-[1.7] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent transition-all ${
        isScrolling
          ? "[&::-webkit-scrollbar-thumb]:bg-white/10"
          : "[&::-webkit-scrollbar-thumb]:bg-transparent"
      } hover:[&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full`}
      onScroll={(e: { currentTarget: HTMLDivElement }) => {
        const el = e.currentTarget;
        autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setIsScrolling(true);
        if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
        scrollTimeout.current = setTimeout(() => setIsScrolling(false), 3000);
      }}
    >
      <div className="p-4 pb-6 space-y-px">
        {loading && (
          <p className="animate-pulse text-white/20">Connecting to log stream…</p>
        )}
        {!loading && lines.length === 0 && (
          <p className="text-white/20">
            No output yet — logs appear within ~{LOG_POLL_MS / 1000}s of activity.
          </p>
        )}
        {visibleLines.map((l) => {
          const cleanLine = l.line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, "");
          return (
            <div key={l._key} className="flex gap-3 animate-log-in">
              <span className="w-[52px] shrink-0 select-none text-white/25">
                {new Date(l.ts).toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className={streamColor(l.stream)}>{cleanLine}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
