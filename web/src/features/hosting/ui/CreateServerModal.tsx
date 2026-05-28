"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, Server, X, Cpu, MemoryStick, Zap } from "lucide-react";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kleffio/ui";
import { toast } from "sonner";
import { listCrates, listBlueprints } from "@/lib/api/catalog";
import { createDeployment } from "@/lib/api/deployments";
import { provisionWorkloadForNamespace } from "@/lib/api/projects";
import type { EnvironmentScope } from "@/lib/api/projects";
import type { Crate, Blueprint } from "@/lib/api/catalog";
import { getRequiredRuntime, fetchMinecraftJavaVersion, isMinecraftRelated, selectConstructForRuntime } from "@/lib/utils/runtimeDetection";
import { AnimatePresence, motion } from "framer-motion";

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

interface SizeOption {
  id: "small" | "medium" | "large";
  label: string;
  sub: string;
  cpu_millicores: number;
  memory_mb: number;
}

const SIZES: SizeOption[] = [
  { id: "small",  label: "Small",  sub: "1 vCPU · 2 GB RAM",  cpu_millicores: 1000, memory_mb: 2048 },
  { id: "medium", label: "Medium", sub: "2 vCPU · 4 GB RAM",  cpu_millicores: 2000, memory_mb: 4096 },
  { id: "large",  label: "Large",  sub: "4 vCPU · 8 GB RAM",  cpu_millicores: 4000, memory_mb: 8192 },
];

type Step = "size" | "game" | "configure";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectID: string | null;
  /** Phase 1: when set, deployments go directly to the namespace (no environment). */
  namespaceSlug?: string | null;
  scope?: EnvironmentScope;
  onCreated?: () => void;
}

export function CreateServerModal({ open, onOpenChange, projectID, namespaceSlug, scope, onCreated }: Props) {
  const [step, setStep] = useState<Step>("size");
  const [size, setSize] = useState<SizeOption | null>(null);

  const [crates, setCrates] = useState<Crate[]>([]);
  const [loadingCrates, setLoadingCrates] = useState(false);
  const [selectedCrate, setSelectedCrate] = useState<Crate | null>(null);

  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);

  const [serverName, setServerName] = useState("");
  const [mojangVersions, setMojangVersions] = useState<MojangVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState("");
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liveJavaVersion, setLiveJavaVersion] = useState<number | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);

  const isMC = isMinecraftRelated(selectedCrate?.id ?? "");

  // Resolve the exact Java version from Mojang's per-version manifest
  useEffect(() => {
    if (!isMC || !selectedVersion || mojangVersions.length === 0) return;
    const entry = mojangVersions.find((v) => v.id === selectedVersion);
    if (!entry?.url) return;
    let cancelled = false;
    setRuntimeLoading(true);
    setLiveJavaVersion(null);
    fetchMinecraftJavaVersion(entry.url).then((jv) => {
      if (!cancelled) setLiveJavaVersion(jv);
    }).finally(() => { if (!cancelled) setRuntimeLoading(false); });
    return () => { cancelled = true; };
  }, [selectedVersion, isMC, mojangVersions]);

  // Effective runtime: live result from Mojang > static fallback
  const fallbackRuntime = getRequiredRuntime(selectedCrate?.id ?? "", selectedVersion);
  const runtime = isMC && liveJavaVersion !== null
    ? { runtime: "java" as const, version: String(liveJavaVersion), label: `Java ${liveJavaVersion}` }
    : fallbackRuntime;

  const releaseVersions = mojangVersions.filter((v) => v.type === "release");
  const shownVersions = showSnapshots ? mojangVersions : releaseVersions;

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("size");
      setSize(null);
      setCrates([]);
      setSelectedCrate(null);
      setBlueprints([]);
      setSelectedBlueprint(null);
      setServerName("");
      setMojangVersions([]);
      setSelectedVersion("");
      setShowSnapshots(false);
      setLiveJavaVersion(null);
      setRuntimeLoading(false);
    }
  }, [open]);

  // Load game crates when opening game step
  useEffect(() => {
    if (step !== "game") return;
    setLoadingCrates(true);
    listCrates("games")
      .then((res) => setCrates(res.crates ?? []))
      .catch(() => {
        // Try loading all crates and filter client-side
        listCrates()
          .then((res) => setCrates(res.crates ?? []))
          .catch(() => {});
      })
      .finally(() => setLoadingCrates(false));
  }, [step]);

  function selectCrate(crate: Crate) {
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

  function advanceToConfigure() {
    if (!selectedBlueprint) return;
    setStep("configure");

    if (isMC) {
      fetchMojangVersions()
        .then((versions) => {
          setMojangVersions(versions);
          const latest = versions.find((v) => v.type === "release")?.id ?? "";
          setSelectedVersion(latest);
        })
        .catch(() => {});
    }
  }

  async function deploy() {
    if (!selectedBlueprint || !serverName.trim() || !size) return;
    if (!namespaceSlug && !projectID && !scope) return;
    setSubmitting(true);
    try {
      // Build config from blueprint defaults
      const config: Record<string, string> = {};
      for (const field of selectedBlueprint.config) {
        if (field.default !== undefined && field.default !== null) {
          config[field.key] = String(field.default);
        } else {
          config[field.key] = "";
        }
      }

      // Set Minecraft version
      if (isMC && selectedVersion) {
        config.VERSION = selectedVersion;
      }

      // Auto-select runtime construct
      const constructs = selectedBlueprint.constructs ?? {};
      if (Object.keys(constructs).length > 0) {
        const constructKey = selectConstructForRuntime(constructs, runtime);
        if (constructKey) config.IMAGE = constructKey;
      }

      if (namespaceSlug) {
        // Phase 1: namespace-first provisioning (no environment layer)
        await provisionWorkloadForNamespace(namespaceSlug, {
          server_name: serverName.trim(),
          blueprint_id: selectedBlueprint.id,
          env_overrides: config,
          memory_bytes: size.memory_mb * 1024 * 1024,
          cpu_millicores: size.cpu_millicores,
        });
      } else {
        await createDeployment(projectID ?? "", {
          blueprint_id: selectedBlueprint.id,
          server_name: serverName.trim(),
          config,
          resources: { memory_mb: size.memory_mb, cpu_millicores: size.cpu_millicores },
        }, scope);
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

  function goBack() {
    if (step === "configure") setStep("game");
    else if (step === "game") setStep("size");
  }

  const canNextGame = !!selectedBlueprint;
  const canDeploy = !!serverName.trim() && (!isMC || !!selectedVersion);

  if (!open) return null;

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
            className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-[14px] border border-[#f5b517]/20 bg-[#090909] shadow-[0_32px_80px_rgba(0,0,0,0.7),0_0_0_1px_rgba(245,181,23,0.04)_inset]"
            style={{ maxHeight: "min(680px, 92vh)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Golden top glow */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.10),transparent)]" />

            {/* Header */}
            <div className="relative flex items-center gap-3 border-b border-[#f5b517]/10 px-5 py-4">
              {step !== "size" && (
                <button
                  onClick={goBack}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[#f5b517]/15 bg-[#f5b517]/[0.04] text-[#f5b517]/40 transition-colors hover:bg-[#f5b517]/[0.10] hover:text-[#f5b517]/70"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white/90">
                  {step === "size" && "Create Server"}
                  {step === "game" && "Choose Game"}
                  {step === "configure" && "Configure"}
                </p>
                <p className="text-[11px] text-white/30 mt-0.5">
                  {step === "size" && "How much resources does your server need?"}
                  {step === "game" && "What would you like to run?"}
                  {step === "configure" && `Setting up ${selectedBlueprint?.name ?? "server"}`}
                </p>
              </div>
              {/* Step dots */}
              <div className="flex items-center gap-1.5">
                {(["size", "game", "configure"] as Step[]).map((s) => (
                  <div
                    key={s}
                    className={`h-1 rounded-full transition-all ${
                      s === step ? "w-4 bg-primary" : "w-1 bg-white/15"
                    }`}
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Step 1: Size ── */}
              {step === "size" && (
                <div className="p-5 space-y-3">
                  {SIZES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSize(s)}
                      className={`w-full flex items-center gap-4 rounded-[10px] border px-4 py-3.5 text-left transition-all ${
                        size?.id === s.id
                          ? "border-[#f5b517]/35 bg-[#f5b517]/[0.06]"
                          : "border-[#f5b517]/10 bg-white/[0.02] hover:border-[#f5b517]/20 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        size?.id === s.id
                          ? "border-[#f5b517]/30 bg-[#f5b517]/10 text-[#f5b517]"
                          : "border-white/[0.08] bg-white/[0.04] text-white/30"
                      }`}>
                        {s.id === "small"  && <Zap className="size-4" />}
                        {s.id === "medium" && <Cpu className="size-4" />}
                        {s.id === "large"  && <MemoryStick className="size-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-semibold ${size?.id === s.id ? "text-white/90" : "text-white/60"}`}>
                          {s.label}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${size?.id === s.id ? "text-white/40" : "text-white/25"}`}>
                          {s.sub}
                        </p>
                      </div>
                      <div className={`size-4 rounded-full border-2 shrink-0 transition-colors ${
                        size?.id === s.id ? "border-[#f5b517] bg-[#f5b517]" : "border-white/20"
                      }`} />
                    </button>
                  ))}
                </div>
              )}

              {/* ── Step 2: Game ── */}
              {step === "game" && (
                <div className="p-5 space-y-4">
                  {loadingCrates ? (
                    <div className="flex items-center justify-center py-12 text-[13px] text-white/30">
                      Loading catalog…
                    </div>
                  ) : crates.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-[13px] text-white/30">
                      No games available yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {crates.map((crate) => (
                        <button
                          key={crate.id}
                          onClick={() => selectCrate(crate)}
                          className={`w-full flex items-center gap-3 rounded-[10px] border px-3.5 py-3 text-left transition-all ${
                            selectedCrate?.id === crate.id
                              ? "border-[#f5b517]/35 bg-[#f5b517]/[0.06]"
                              : "border-[#f5b517]/10 bg-white/[0.02] hover:border-[#f5b517]/20 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04]">
                            {crate.logo ? (
                              <img src={crate.logo} alt={crate.name} className="size-5 object-contain" />
                            ) : (
                              <Server className="size-4 text-white/30" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium ${selectedCrate?.id === crate.id ? "text-white/90" : "text-white/60"}`}>
                              {crate.name}
                            </p>
                            {crate.description && (
                              <p className="text-[11px] text-white/25 truncate mt-0.5">{crate.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Blueprint selection (shown after crate picked) */}
                  {selectedCrate && (
                    <div className="pt-1 space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-white/30 px-0.5">Template</p>
                      {loadingBlueprints ? (
                        <p className="text-[12px] text-white/25 px-0.5">Loading templates…</p>
                      ) : blueprints.length === 0 ? (
                        <p className="text-[12px] text-white/25 px-0.5">No templates found.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {blueprints.map((bp) => (
                            <button
                              key={bp.id}
                              onClick={() => setSelectedBlueprint(bp)}
                              className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                                selectedBlueprint?.id === bp.id
                                  ? "border-[#f5b517]/40 bg-[#f5b517]/10 text-[#f5b517]"
                                  : "border-[#f5b517]/10 bg-white/[0.03] text-white/40 hover:border-[#f5b517]/20 hover:text-white/60"
                              }`}
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

              {/* ── Step 3: Configure ── */}
              {step === "configure" && (
                <div className="p-5 space-y-5">
                  {/* Server name */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] uppercase tracking-[0.1em] text-white/40">Server Name</label>
                    <input
                      value={serverName}
                      onChange={(e) => setServerName(e.target.value)}
                      placeholder="my-server"
                      autoFocus
                      className="w-full rounded-[8px] border border-[#f5b517]/12 bg-white/[0.03] px-3 py-2.5 text-[13px] text-white/80 placeholder:text-white/20 outline-none focus:border-[#f5b517]/35 focus:bg-[#f5b517]/[0.03] transition-colors"
                    />
                  </div>

                  {/* Version picker (Minecraft) */}
                  {isMC && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] uppercase tracking-[0.1em] text-white/40">Version</label>
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
                        <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                          <SelectTrigger className="h-10 rounded-[8px] border-[#f5b517]/12 bg-white/[0.03] px-3 text-[13px] text-white/80 focus:border-[#f5b517]/35">
                            <SelectValue placeholder="Select version…" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {shownVersions.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.id}
                                {v.type === "snapshot" && (
                                  <span className="ml-1.5 text-[10px] text-white/40">snapshot</span>
                                )}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Game</span>
                      <span className="text-[12px] font-medium text-white/60">{selectedCrate?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Template</span>
                      <span className="text-[12px] font-medium text-white/60">{selectedBlueprint?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Resources</span>
                      <span className="text-[12px] font-medium text-white/60">{size?.sub}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="relative border-t border-[#f5b517]/10 px-5 py-4">
              {step === "size" && (
                <button
                  disabled={!size}
                  onClick={() => setStep("game")}
                  className="w-full rounded-[8px] bg-primary/10 border border-primary/20 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Choose Game
                </button>
              )}
              {step === "game" && (
                <button
                  disabled={!canNextGame}
                  onClick={advanceToConfigure}
                  className="w-full rounded-[8px] bg-primary/10 border border-primary/20 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Configure
                </button>
              )}
              {step === "configure" && (
                <button
                  disabled={!canDeploy || submitting || (!namespaceSlug && !projectID && !scope)}
                  onClick={deploy}
                  className="w-full rounded-[8px] bg-primary/10 border border-primary/20 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating…" : "Create Server"}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
