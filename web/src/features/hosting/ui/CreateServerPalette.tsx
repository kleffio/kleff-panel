"use client";

import * as React from "react";
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Gamepad2,
  Database,
  Box,
  Package,
  Server,
  X,
  Sparkles,
  Check,
} from "lucide-react";
import { cn } from "@kleffio/ui";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { listCrates, listBlueprints } from "@/lib/api/catalog";
import { provisionWorkloadForNamespace } from "@/lib/api/projects";
import { createDeployment } from "@/lib/api/deployments";
import { getNamespaceQuota } from "@/lib/api/namespaces";
import type { EnvironmentScope } from "@/lib/api/projects";
import type { Crate, Blueprint } from "@/lib/api/catalog";
import {
  getRequiredRuntime,
  fetchMinecraftJavaVersion,
  isMinecraftRelated,
  selectConstructForRuntime,
} from "@/lib/utils/runtimeDetection";

// ── Types ────────────────────────────────────────────────────────────────────

interface MojangVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
  url: string;
}

async function fetchMojangVersions(): Promise<MojangVersion[]> {
  const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
  const data = await res.json();
  return (data.versions ?? []) as MojangVersion[];
}

interface TopCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  description?: string;
  hasSubcategory?: boolean;
}

const TOP_CATEGORIES: TopCategory[] = [
  { id: "game-server", label: "Game Server",   icon: Gamepad2, hasSubcategory: true },
  { id: "database",    label: "Database",      icon: Database, hasSubcategory: true },
  { id: "docker",      label: "Docker Image",  icon: Box,      description: "Any image from Docker Hub" },
  { id: "template",    label: "From Template", icon: Package,  description: "Pre-built stacks", hasSubcategory: true },
  { id: "empty",       label: "Empty Server",  icon: Server,   description: "Start from scratch" },
];

const AI_SUGGESTIONS = [
  "Minecraft server with survival mode",
  "Deploy Redis and Postgres",
];

type Step = "category" | "subcategory" | "size" | "configure";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CreateServerPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectID?: string | null;
  namespaceSlug?: string | null;
  scope?: EnvironmentScope;
  onCreated?: () => void;
  initialCategory?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateServerPalette({
  open,
  onOpenChange,
  projectID,
  namespaceSlug,
  scope,
  onCreated,
  initialCategory,
}: CreateServerPaletteProps) {
  const [step, setStep] = React.useState<Step>("category");
  const [query, setQuery] = React.useState("");
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Subcategory (API-loaded crates)
  const [crates, setCrates] = React.useState<Crate[]>([]);
  const [loadingCrates, setLoadingCrates] = React.useState(false);
  const [selectedCrate, setSelectedCrate] = React.useState<Crate | null>(null);
  const [blueprints, setBlueprints] = React.useState<Blueprint[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = React.useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = React.useState<Blueprint | null>(null);

  // Resources
  const [cpuMillicores, setCpuMillicores] = React.useState(1000);
  const [memoryMb, setMemoryMb] = React.useState(2048);
  const [quota, setQuota] = React.useState<{ cpu_millicores: number; memory_mb: number } | null>(null);
  const [quotaLoading, setQuotaLoading] = React.useState(false);

  // Configure
  const [serverName, setServerName] = React.useState("");
  const [mojangVersions, setMojangVersions] = React.useState<MojangVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = React.useState("");
  const [showSnapshots, setShowSnapshots] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [liveJavaVersion, setLiveJavaVersion] = React.useState<number | null>(null);
  const [runtimeLoading, setRuntimeLoading] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const nameRef = React.useRef<HTMLInputElement>(null);

  const isMC = isMinecraftRelated(selectedCrate?.id ?? "");
  const fallbackRuntime = getRequiredRuntime(selectedCrate?.id ?? "", selectedVersion);
  const runtime =
    isMC && liveJavaVersion !== null
      ? { runtime: "java" as const, version: String(liveJavaVersion), label: `Java ${liveJavaVersion}` }
      : fallbackRuntime;

  const releaseVersions = mojangVersions.filter((v) => v.type === "release");
  const shownVersions = showSnapshots ? mojangVersions : releaseVersions;

  // Reset on open/close
  React.useEffect(() => {
    if (open) {
      const initCat = initialCategory ?? null;
      setStep(initCat ? "subcategory" : "category");
      setSelectedCategoryId(initCat);
      setQuery("");
      setSelectedIndex(0);
      setCrates([]);
      setSelectedCrate(null);
      setBlueprints([]);
      setSelectedBlueprint(null);
      setCpuMillicores(1000);
      setMemoryMb(2048);
      setQuota(null);
      setServerName("");
      setMojangVersions([]);
      setSelectedVersion("");
      setShowSnapshots(false);
      setLiveJavaVersion(null);
      setRuntimeLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialCategory]);

  // Load crates when entering subcategory step
  React.useEffect(() => {
    if (step !== "subcategory" || !selectedCategoryId) return;
    if (selectedCategoryId === "game-server") {
      setLoadingCrates(true);
      listCrates("games")
        .then((res) => setCrates(res.crates ?? []))
        .catch(() => listCrates().then((res) => setCrates(res.crates ?? [])).catch(() => {}))
        .finally(() => setLoadingCrates(false));
    }
  }, [step, selectedCategoryId]);

  // Fetch namespace quota when entering size step
  React.useEffect(() => {
    if (step !== "size") return;
    const slug = namespaceSlug ?? scope?.namespaceSlug;
    if (!slug) return;
    setQuotaLoading(true);
    getNamespaceQuota(slug)
      .then((q) => {
        setQuota(q);
        if (q.cpu_millicores > 0) setCpuMillicores(Math.min(1000, q.cpu_millicores));
        if (q.memory_mb > 0) setMemoryMb(Math.min(2048, q.memory_mb));
      })
      .catch(() => { /* quota endpoint may not exist yet — use defaults */ })
      .finally(() => setQuotaLoading(false));
  }, [step, namespaceSlug, scope?.namespaceSlug]);

  // Resolve Mojang Java version
  React.useEffect(() => {
    if (!isMC || !selectedVersion || mojangVersions.length === 0) return;
    const entry = mojangVersions.find((v) => v.id === selectedVersion);
    if (!entry?.url) return;
    let cancelled = false;
    setRuntimeLoading(true);
    setLiveJavaVersion(null);
    fetchMinecraftJavaVersion(entry.url)
      .then((jv) => { if (!cancelled) setLiveJavaVersion(jv); })
      .finally(() => { if (!cancelled) setRuntimeLoading(false); });
    return () => { cancelled = true; };
  }, [selectedVersion, isMC, mojangVersions]);

  // Focus name input when entering configure step
  React.useEffect(() => {
    if (step === "configure") {
      setTimeout(() => nameRef.current?.focus(), 50);
      if (isMC) {
        fetchMojangVersions()
          .then((versions) => {
            setMojangVersions(versions);
            setSelectedVersion(versions.find((v) => v.type === "release")?.id ?? "");
          })
          .catch(() => {});
      }
    }
  }, [step]);

  // ── Filtered category list ──────────────────────────────────────────────────

  const filteredCategories = React.useMemo(() => {
    if (!query) return TOP_CATEGORIES;
    const q = query.toLowerCase();
    return TOP_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  // ── Navigation helpers ──────────────────────────────────────────────────────

  function goBack() {
    if (step === "subcategory") { setStep("category"); setQuery(""); setSelectedCategoryId(null); }
    else if (step === "size") setStep(selectedCategoryId === "empty" || selectedCategoryId === "docker" ? "category" : "subcategory");
    else if (step === "configure") setStep("size");
  }

  function pickCategory(cat: TopCategory) {
    setSelectedCategoryId(cat.id);
    setQuery("");
    setSelectedIndex(0);
    if (cat.hasSubcategory) {
      setStep("subcategory");
    } else {
      setStep("size");
    }
  }

  function pickCrate(crate: Crate) {
    setSelectedCrate(crate);
    setSelectedBlueprint(null);
    setLoadingBlueprints(true);
    listBlueprints(crate.id)
      .then((res) => {
        const bps = res.blueprints ?? [];
        setBlueprints(bps);
        if (bps.length === 1) setSelectedBlueprint(bps[0]!);
      })
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoadingBlueprints(false));
  }

  function advanceFromSubcategory() {
    if (!selectedCrate || !selectedBlueprint) return;
    setStep("size");
    setSelectedIndex(0);
  }

  async function deploy() {
    if (!serverName.trim()) return;
    if (!namespaceSlug && !projectID && !scope) return;
    setSubmitting(true);
    try {
      const config: Record<string, string> = {};
      if (selectedBlueprint) {
        for (const field of selectedBlueprint.config) {
          config[field.key] = field.default !== undefined && field.default !== null ? String(field.default) : "";
        }
        if (isMC && selectedVersion) config.VERSION = selectedVersion;
        const constructs = selectedBlueprint.constructs ?? {};
        if (Object.keys(constructs).length > 0) {
          const constructKey = selectConstructForRuntime(constructs, runtime);
          if (constructKey) config.IMAGE = constructKey;
        }
      }

      const ns = namespaceSlug ?? scope?.namespaceSlug;
      if (ns) {
        await provisionWorkloadForNamespace(ns, {
          server_name: serverName.trim(),
          blueprint_id: selectedBlueprint?.id ?? selectedCategoryId ?? "empty",
          env_overrides: config,
          memory_bytes: memoryMb * 1024 * 1024,
          cpu_millicores: cpuMillicores,
        });
      } else {
        await createDeployment(
          projectID ?? "",
          {
            blueprint_id: selectedBlueprint?.id ?? selectedCategoryId ?? "empty",
            server_name: serverName.trim(),
            config,
            resources: { memory_mb: memoryMb, cpu_millicores: cpuMillicores },
          },
          scope
        );
      }

      toast.success("Server is being provisioned!");
      onOpenChange(false);
      onCreated?.();
    } catch {
      toast.error("Failed to create server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (step === "configure") {
      if (e.key === "Escape") goBack();
      if (e.key === "Enter" && !submitting && serverName.trim()) deploy();
      return;
    }
    if (e.key === "Escape") {
      if (step === "category") onOpenChange(false);
      else goBack();
      return;
    }
    if (step === "size") {
      if (e.key === "Enter") { e.preventDefault(); setStep("configure"); }
      return;
    }
    if (step === "subcategory" && e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, crates.length - 1)); }
    if (step === "subcategory" && e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (step === "category" && e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filteredCategories.length - 1)); }
    if (step === "category" && e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      if (step === "category") {
        const cat = filteredCategories[selectedIndex];
        if (cat) pickCategory(cat);
      }
    }
  }

  const STEP_ORDER: Step[] = ["category", "subcategory", "size", "configure"];
  const stepDots = selectedCategoryId && TOP_CATEGORIES.find(c => c.id === selectedCategoryId)?.hasSubcategory
    ? STEP_ORDER
    : (["category", "size", "configure"] as Step[]);

  const cpuMax = quota?.cpu_millicores ?? 4000;
  const memMax = quota?.memory_mb ?? 8192;
  const quotaIsZero = quota !== null && quota.cpu_millicores === 0;

  function fmtCpu(m: number) { return `${m / 1000} vCPU`; }
  function fmtMem(mb: number) { return mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`; }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className="relative flex w-full max-w-[460px] flex-col overflow-hidden rounded-[14px] border border-[#f5b517]/20 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.7),0_0_0_1px_rgba(245,181,23,0.04)_inset]"
            style={{ maxHeight: "min(520px, 88vh)" }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* Gold top glow */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.10),transparent)]" />

            {/* Header */}
            <div className="relative flex shrink-0 items-center gap-3 border-b border-[#f5b517]/10 px-5 py-3.5">
              {step !== "category" ? (
                <button
                  onClick={goBack}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#f5b517]/15 bg-[#f5b517]/[0.04] text-[#f5b517]/40 transition-colors hover:bg-[#f5b517]/[0.10] hover:text-[#f5b517]/70"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
              ) : (
                <Search className="size-4 shrink-0 text-[#f5b517]/30" />
              )}

              {step === "category" ? (
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                  placeholder="What would you like to create?"
                  className="flex-1 bg-transparent text-[13px] text-white/90 placeholder:text-white/25 outline-none"
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white/90">
                    {step === "subcategory" && "Choose Game"}
                    {step === "size" && "Allocate Resources"}
                    {step === "configure" && "Configure Server"}
                  </p>
                  <p className="text-[11px] text-white/30 mt-0.5">
                    {step === "subcategory" && "What would you like to run?"}
                    {step === "size" && "Set compute for this server"}
                    {step === "configure" && (selectedCrate ? `Setting up ${selectedCrate.name}` : "Almost there")}
                  </p>
                </div>
              )}

              {/* Step dots */}
              <div className="flex items-center gap-1.5 shrink-0">
                {stepDots.map((s) => (
                  <div
                    key={s}
                    className={`h-1 rounded-full transition-all ${s === step ? "w-4 bg-[#f5b517]" : "w-1 bg-white/15"}`}
                  />
                ))}
              </div>

              <button
                onClick={() => onOpenChange(false)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#f5b517]/15 bg-[#f5b517]/[0.04] text-[#f5b517]/40 transition-colors hover:bg-[#f5b517]/[0.10] hover:text-[#f5b517]/70"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* ── Step: Category ── */}
            {step === "category" && (
              <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
                {/* AI suggestions */}
                {!query && (
                  <>
                    {AI_SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        className="flex w-full items-center gap-3 rounded-[10px] border border-transparent px-3.5 py-2 text-left transition-all hover:border-[#f5b517]/15 hover:bg-[#f5b517]/[0.04] group"
                        onClick={() => { onOpenChange(false); }}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-[#f5b517]/20 bg-[#f5b517]/[0.06]">
                          <Sparkles className="size-3 text-[#f5b517]/70" />
                        </span>
                        <span className="text-[13px] text-white/40 group-hover:text-white/70 transition-colors">{s}</span>
                      </button>
                    ))}
                    <div className="my-1 mx-1 h-px bg-[#f5b517]/[0.08]" />
                  </>
                )}

                {filteredCategories.map((cat, i) => {
                  const CatIcon = cat.icon;
                  const isSelected = selectedIndex === i;
                  return (
                    <button
                      key={cat.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-all",
                        isSelected
                          ? "border-[#f5b517]/35 bg-[#f5b517]/[0.06] text-white/90"
                          : "border-transparent text-white/60 hover:border-[#f5b517]/15 hover:bg-[#f5b517]/[0.04]"
                      )}
                      onMouseEnter={() => setSelectedIndex(i)}
                      onClick={() => pickCategory(cat)}
                    >
                      <span className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                        isSelected
                          ? "border-[#f5b517]/30 bg-[#f5b517]/10 text-[#f5b517]"
                          : "border-white/[0.08] bg-white/[0.04] text-white/30"
                      )}>
                        <CatIcon className="size-4" />
                      </span>
                      <span className="flex-1 text-[13px] font-medium">{cat.label}</span>
                      {cat.description && <span className="text-[11px] text-white/25">{cat.description}</span>}
                      {cat.hasSubcategory && (
                        <ChevronRight className={cn("size-4 shrink-0 transition-colors", isSelected ? "text-[#f5b517]/50" : "text-white/20")} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Step: Subcategory (API crates) ── */}
            {step === "subcategory" && (
              <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
                {loadingCrates ? (
                  <div className="flex items-center justify-center py-10 text-[13px] text-white/25">Loading…</div>
                ) : crates.length === 0 ? (
                  <div className="flex items-center justify-center py-10 text-[13px] text-white/25">Nothing available yet.</div>
                ) : (
                  crates.map((crate, i) => {
                    const isSelected = selectedCrate?.id === crate.id;
                    return (
                      <button
                        key={crate.id}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-left transition-all",
                          isSelected
                            ? "border-[#f5b517]/35 bg-[#f5b517]/[0.06] text-white/90"
                            : "border-transparent text-white/60 hover:border-[#f5b517]/15 hover:bg-[#f5b517]/[0.04]"
                        )}
                        onMouseEnter={() => setSelectedIndex(i)}
                        onClick={() => pickCrate(crate)}
                      >
                        <span className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors overflow-hidden",
                          isSelected ? "border-[#f5b517]/30 bg-[#f5b517]/10" : "border-white/[0.08] bg-white/[0.04]"
                        )}>
                          {crate.logo
                            ? <img src={crate.logo} alt={crate.name} className="size-4 object-contain" />
                            : <Server className={cn("size-4", isSelected ? "text-[#f5b517]" : "text-white/30")} />
                          }
                        </span>
                        <span className="flex-1 text-[13px] font-medium">{crate.name}</span>
                        {crate.description && <span className="text-[11px] text-white/25 truncate max-w-[140px]">{crate.description}</span>}
                        {isSelected && <Check className="size-4 shrink-0 text-[#f5b517]" />}
                      </button>
                    );
                  })
                )}

                {/* Blueprint pills */}
                {selectedCrate && (
                  <div className="pt-2 px-1">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-white/25 mb-2">Template</p>
                    {loadingBlueprints ? (
                      <p className="text-[12px] text-white/25">Loading…</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {blueprints.map((bp) => (
                          <button
                            key={bp.id}
                            onClick={() => setSelectedBlueprint(bp)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all",
                              selectedBlueprint?.id === bp.id
                                ? "border-[#f5b517]/40 bg-[#f5b517]/10 text-[#f5b517]"
                                : "border-[#f5b517]/10 bg-white/[0.03] text-white/40 hover:border-[#f5b517]/20 hover:text-white/60"
                            )}
                          >
                            {bp.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Step: Resources ── */}
            {step === "size" && (
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {quotaLoading ? (
                  <div className="flex items-center justify-center py-10 text-[13px] text-white/25">Loading…</div>
                ) : quotaIsZero ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <p className="text-[14px] font-medium text-white/40">No resources allocated</p>
                    <p className="text-[12px] text-white/25 max-w-[260px] leading-relaxed">
                      This namespace has no compute resources assigned. Contact your administrator to allocate resources.
                    </p>
                  </div>
                ) : (
                  <>
                    {quota && (
                      <div className="flex items-center justify-between rounded-[8px] border border-[#f5b517]/10 bg-[#f5b517]/[0.02] px-3 py-2">
                        <span className="text-[11px] text-white/30">Namespace quota</span>
                        <span className="text-[12px] font-medium text-white/50">
                          {fmtCpu(quota.cpu_millicores)} · {fmtMem(quota.memory_mb)} available
                        </span>
                      </div>
                    )}

                    {/* CPU slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] uppercase tracking-[0.1em] text-white/30">CPU</label>
                        <span className="text-[13px] font-semibold text-[#f5b517]/80">{fmtCpu(cpuMillicores)}</span>
                      </div>
                      <input
                        type="range"
                        min={500}
                        max={cpuMax}
                        step={500}
                        value={cpuMillicores}
                        onChange={(e) => setCpuMillicores(Number(e.target.value))}
                        className="w-full accent-[#f5b517] cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-white/20">
                        <span>0.5 vCPU</span>
                        <span>{fmtCpu(cpuMax)}</span>
                      </div>
                    </div>

                    {/* Memory slider */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] uppercase tracking-[0.1em] text-white/30">Memory</label>
                        <span className="text-[13px] font-semibold text-[#f5b517]/80">{fmtMem(memoryMb)}</span>
                      </div>
                      <input
                        type="range"
                        min={512}
                        max={memMax}
                        step={512}
                        value={memoryMb}
                        onChange={(e) => setMemoryMb(Number(e.target.value))}
                        className="w-full accent-[#f5b517] cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-white/20">
                        <span>512 MB</span>
                        <span>{fmtMem(memMax)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Step: Configure ── */}
            {step === "configure" && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Server name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] uppercase tracking-[0.1em] text-white/30">Server Name</label>
                  <input
                    ref={nameRef}
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="my-server"
                    className="w-full rounded-[8px] border border-[#f5b517]/12 bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/80 placeholder:text-white/20 outline-none focus:border-[#f5b517]/35 focus:bg-[#f5b517]/[0.03] transition-colors"
                  />
                </div>

                {/* MC version picker */}
                {isMC && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] uppercase tracking-[0.1em] text-white/30">Version</label>
                      <button
                        type="button"
                        onClick={() => setShowSnapshots((v) => !v)}
                        className="text-[10px] text-white/25 hover:text-white/50 transition-colors"
                      >
                        {showSnapshots ? "Hide snapshots" : "Show snapshots"}
                      </button>
                    </div>
                    {mojangVersions.length === 0 ? (
                      <div className="rounded-[8px] border border-[#f5b517]/10 bg-white/[0.02] px-3 py-2.5 text-[13px] text-white/25">
                        Loading versions…
                      </div>
                    ) : (
                      <div className="max-h-36 overflow-y-auto rounded-[8px] border border-[#f5b517]/12 bg-white/[0.02] divide-y divide-[#f5b517]/[0.06]">
                        {shownVersions.slice(0, 20).map((v) => (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVersion(v.id)}
                            className={cn(
                              "flex w-full items-center justify-between px-3 py-2 text-[12px] transition-colors",
                              selectedVersion === v.id
                                ? "bg-[#f5b517]/[0.06] text-[#f5b517]"
                                : "text-white/50 hover:bg-white/[0.03] hover:text-white/70"
                            )}
                          >
                            {v.id}
                            {v.type === "snapshot" && <span className="text-[10px] text-white/30">snapshot</span>}
                            {selectedVersion === v.id && <Check className="size-3.5 text-[#f5b517]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Runtime badge */}
                {(runtime.label || runtimeLoading) && (
                  <div className="flex items-center gap-2 rounded-[8px] border border-[#f5b517]/12 bg-[#f5b517]/[0.03] px-3 py-2.5">
                    <div className={`size-1.5 rounded-full shrink-0 ${runtimeLoading ? "bg-[#f5b517]/30 animate-pulse" : "bg-emerald-400"}`} />
                    <span className="text-[12px] text-white/40">Runtime</span>
                    <span className="text-[12px] font-medium text-white/70 ml-auto">
                      {runtimeLoading ? "Detecting…" : runtime.label}
                    </span>
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-[8px] border border-[#f5b517]/10 bg-white/[0.02] px-3 py-2.5 space-y-1.5">
                  {selectedCrate && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Game</span>
                      <span className="text-[12px] font-medium text-white/60">{selectedCrate.name}</span>
                    </div>
                  )}
                  {selectedBlueprint && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Template</span>
                      <span className="text-[12px] font-medium text-white/60">{selectedBlueprint.name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/30">Resources</span>
                    <span className="text-[12px] font-medium text-white/60">
                      {fmtCpu(cpuMillicores)} · {fmtMem(memoryMb)} RAM
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="relative shrink-0 border-t border-[#f5b517]/[0.08] px-5 py-3.5">
              {step === "subcategory" && (
                <button
                  disabled={!selectedBlueprint}
                  onClick={advanceFromSubcategory}
                  className="w-full rounded-[8px] border border-[#f5b517]/20 bg-[#f5b517]/10 py-2.5 text-[13px] font-semibold text-[#f5b517] transition-all hover:bg-[#f5b517]/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              )}
              {step === "size" && !quotaIsZero && !quotaLoading && (
                <button
                  onClick={() => setStep("configure")}
                  className="w-full rounded-[8px] border border-[#f5b517]/20 bg-[#f5b517]/10 py-2.5 text-[13px] font-semibold text-[#f5b517] transition-all hover:bg-[#f5b517]/20"
                >
                  Continue
                </button>
              )}
              {step === "configure" && (
                <button
                  disabled={!serverName.trim() || submitting || (!namespaceSlug && !projectID && !scope)}
                  onClick={deploy}
                  className="w-full rounded-[8px] border border-[#f5b517]/20 bg-[#f5b517]/10 py-2.5 text-[13px] font-semibold text-[#f5b517] transition-all hover:bg-[#f5b517]/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating…" : "Create Server"}
                </button>
              )}
              {step === "category" && (
                <div className="flex items-center gap-4">
                  {[
                    { key: "↑↓", label: "navigate" },
                    { key: "↵", label: "select" },
                    { key: "Esc", label: "close" },
                  ].map(({ key, label }) => (
                    <span key={key} className="flex items-center gap-1.5 text-[11px] text-white/20">
                      <kbd className="flex h-4 items-center px-1 rounded border border-[#f5b517]/15 font-mono text-[9px] text-[#f5b517]/40">{key}</kbd>
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
