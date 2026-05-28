"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@kleffio/ui";

// ── Size variants ──────────────────────────────────────────────────────────

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const;

type ModalSize = keyof typeof sizeClasses;

// ── Root ───────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  size?: ModalSize;
}

function Modal({ open, onOpenChange, children, size = "md" }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop */}
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/55",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100"
          )}
        />

        {/* Centering wrapper */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Outer animate wrapper */}
          <Dialog.Content
            className={cn(
              "relative w-full mx-auto",
              sizeClasses[size],
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-3 data-[state=open]:zoom-in-[0.97] data-[state=open]:duration-200",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:duration-150",
              "focus:outline-none"
            )}
          >
            {/* Gradient border ring */}
            <div className="absolute -inset-px rounded-[17px] bg-gradient-to-b from-white/[0.07] to-white/[0.02] pointer-events-none" />

            {/* Inner card */}
            <div className="relative rounded-2xl overflow-hidden bg-background shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_48px_120px_rgba(0,0,0,0.95)]">
              {/* Top highlight */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent pointer-events-none" />
              {children}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────

interface ModalHeaderProps {
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

function ModalHeader({ children, onClose, className }: ModalHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-6 py-5 bg-white/[0.02] border-b border-white/[0.05]",
        className
      )}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {onClose !== undefined && (
        <Dialog.Close
          onClick={onClose}
          className="ml-3 flex size-7 items-center justify-center rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors shrink-0"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </Dialog.Close>
      )}
    </div>
  );
}

// ── Title / Description ────────────────────────────────────────────────────

function ModalTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Title
      className={cn(
        "text-[15px] font-semibold text-white tracking-tight leading-snug",
        className
      )}
    >
      {children}
    </Dialog.Title>
  );
}

function ModalDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Description
      className={cn("text-[12px] text-white/35 mt-0.5", className)}
    >
      {children}
    </Dialog.Description>
  );
}

// ── Body ───────────────────────────────────────────────────────────────────

function ModalBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-5 space-y-4 bg-white/[0.01]", className)}>
      {children}
    </div>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────

function ModalFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 px-6 py-4 bg-white/[0.015] border-t border-white/[0.05]",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Label helper ───────────────────────────────────────────────────────────

function ModalLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[10px] font-bold text-white/40 uppercase tracking-[0.12em]",
        className
      )}
    >
      {children}
    </span>
  );
}

export { Modal, ModalHeader, ModalTitle, ModalDescription, ModalBody, ModalFooter, ModalLabel };
export type { ModalSize };
