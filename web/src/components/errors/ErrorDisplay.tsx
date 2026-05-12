"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Home, RefreshCw, ArrowLeft, ShieldOff, Lock, ServerCrash, WifiOff } from "lucide-react";

interface ErrorMeta {
  title: string;
  description: string;
  icon: React.ElementType;
}

const ERROR_META: Record<number, ErrorMeta> = {
  400: {
    title: "Bad Request",
    description: "The request was malformed or contained invalid parameters.",
    icon: AlertTriangle,
  },
  401: {
    title: "Unauthorized",
    description: "You need to be signed in to access this resource.",
    icon: ShieldOff,
  },
  403: {
    title: "Forbidden",
    description: "You don't have permission to access this page.",
    icon: Lock,
  },
  404: {
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist or has been moved.",
    icon: AlertTriangle,
  },
  408: {
    title: "Request Timeout",
    description: "The server took too long to respond. Please try again.",
    icon: WifiOff,
  },
  429: {
    title: "Too Many Requests",
    description: "You've made too many requests. Please slow down and try again.",
    icon: AlertTriangle,
  },
  500: {
    title: "Internal Server Error",
    description: "Something went wrong on our end. We're working on it.",
    icon: ServerCrash,
  },
  502: {
    title: "Bad Gateway",
    description: "The server received an invalid response from an upstream service.",
    icon: ServerCrash,
  },
  503: {
    title: "Service Unavailable",
    description: "The service is temporarily unavailable. Please try again shortly.",
    icon: ServerCrash,
  },
  504: {
    title: "Gateway Timeout",
    description: "An upstream service did not respond in time.",
    icon: ServerCrash,
  },
};

const FALLBACK_META: ErrorMeta = {
  title: "Unexpected Error",
  description: "Something went wrong. Please try again or contact support.",
  icon: AlertTriangle,
};

interface ErrorDisplayProps {
  status?: number | null;
  message?: string;
  onReset?: () => void;
}

export function ErrorDisplay({ status, message, onReset }: ErrorDisplayProps) {
  const router = useRouter();
  const meta = status != null ? (ERROR_META[status] ?? FALLBACK_META) : FALLBACK_META;
  const Icon = meta.icon;
  const displayCode = status ?? "ERR";

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">

      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
      </div>

      {/* Ghost status code */}
      <div
        aria-hidden
        className="pointer-events-none absolute select-none text-[clamp(180px,30vw,320px)] font-black leading-none text-primary/[0.04] tracking-tighter"
      >
        {displayCode}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 text-center max-w-md">

        {/* Icon badge */}
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-lg">
          <Icon className="size-6 text-primary" />
        </div>

        {/* Status + title */}
        <div className="space-y-2">
          {status && (
            <p className="text-xs font-mono font-semibold uppercase tracking-widest text-primary/70">
              {status}
            </p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {meta.title}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {message ?? meta.description}
          </p>
        </div>

        {/* Divider */}
        <div className="w-12 h-px bg-border" />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Home className="size-3.5" />
            Go home
          </Link>

          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-3.5" />
            Go back
          </button>

          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              <RefreshCw className="size-3.5" />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
