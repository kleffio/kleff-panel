"use client";

import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@kleffio/ui";

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  background?: string;
}

export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  ({ background = "oklch(0.8 0.17 90)", className, children, style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "group relative z-0 flex cursor-pointer items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap",
          "px-4 h-9 text-[12px] font-semibold text-black",
          "rounded-[10px]",
          "transition-all duration-300 hover:opacity-90 active:scale-[0.97]",
          "shadow-[0_0_20px_oklch(0.80_0.17_90_/_0.30)]",
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
          className
        )}
        style={{ background, ...style }}
        {...props}
      >
        {/* shimmer sweep overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, oklch(1 0 0 / 0.22) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "shimmer 2.2s linear infinite",
          }}
        />
        <span className="relative z-10 flex items-center gap-1.5">{children}</span>
      </button>
    );
  }
);
ShimmerButton.displayName = "ShimmerButton";
