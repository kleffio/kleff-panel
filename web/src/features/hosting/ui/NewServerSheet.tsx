"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Container,
  Database,
  Gamepad2,
  Github,
  Search,
  Server,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  cn,
} from "@kleffio/ui";
import { toast } from "sonner";
import { listCrates, listBlueprints } from "@/lib/api/catalog";
import { createDeployment } from "@/lib/api/deployments";
import { provisionWorkloadForNamespace } from "@/lib/api/projects";
import { isApiError } from "@/lib/api/error";
import type { Crate, Blueprint, ConfigField } from "@/lib/api/catalog";
import type { EnvironmentScope } from "@/lib/api/projects";
import { AnimatePresence, motion } from "framer-motion";

type Step = "catalog" | "blueprint" | "config";
type CatalogCategory = "games" | "databases" | "docker-images" | "github-repos";

type ResourceCategory = {
  id: CatalogCategory;
  label: string;
  description: string;
  aliases: string[];
  icon: LucideIcon;
};

const RESOURCE_CATEGORIES: ResourceCategory[] = [
  {
    id: "games",
    label: "Games",
    description: "Dedicated game server templates",
    aliases: ["game", "games", "minecraft", "paper", "purpur", "spigot", "bukkit", "fabric", "forge", "neoforge", "bedrock"],
    icon: Gamepad2,
  },
  {
    id: "databases",
    label: "Databases",
    description: "SQL and NoSQL data stores",
    aliases: ["database", "databases", "db", "sql", "postgres", "mysql", "mongo", "redis"],
    icon: Database,
  },
  {
    id: "docker-images",
    label: "Docker Images",
    description: "Run custom container images",
    aliases: ["docker", "image", "images", "container", "oci"],
    icon: Container,
  },
  {
    id: "github-repos",
    label: "GitHub Repositories",
    description: "Deploy from GitHub source repos",
    aliases: ["repository", "repositories", "repo", "git", "github", "source", "scm"],
    icon: Github,
  },
];

const DEFAULT_CATEGORY: CatalogCategory = "games";

interface MojangVersion {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha";
}

interface NewServerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectID: string | null;
  namespaceSlug?: string | null;
  scope?: EnvironmentScope;
  onCreated?: (deploymentId: string) => void;
  activeServerNames?: string[];
  floating?: boolean;
}

const MEMORY_OPTIONS: { label: string; mb: number }[] = [
  { label: "2 GB", mb: 2048 },
  { label: "4 GB", mb: 4096 },
  { label: "8 GB", mb: 8192 },
  { label: "16 GB", mb: 16384 },
];

const CPU_OPTIONS: { label: string; millicores: number }[] = [
  { label: "1 vCPU", millicores: 1000 },
  { label: "2 vCPU", millicores: 2000 },
  { label: "4 vCPU", millicores: 4000 },
  { label: "8 vCPU", millicores: 8000 },
];

function nearestMemoryOption(mb: number): number {
  const exact = MEMORY_OPTIONS.find((o) => o.mb === mb);
  if (exact) return exact.mb;
  return MEMORY_OPTIONS.reduce((prev, cur) =>
    Math.abs(cur.mb - mb) < Math.abs(prev.mb - mb) ? cur : prev
  ).mb;
}

function nearestCPUOption(millicores: number): number {
  const exact = CPU_OPTIONS.find((o) => o.millicores === millicores);
  if (exact) return exact.millicores;
  return CPU_OPTIONS.reduce((prev, cur) =>
    Math.abs(cur.millicores - millicores) < Math.abs(prev.millicores - millicores) ? cur : prev
  ).millicores;
}

function generateSecret(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function buildDefaults(fields: ConfigField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    if (f.auto_generate && f.auto_generate_length) {
      values[f.key] = generateSecret(f.auto_generate_length);
    } else if (f.default !== undefined && f.default !== null) {
      values[f.key] = String(f.default);
    } else {
      values[f.key] = "";
    }
  }
  return values;
}

function extractErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    const payload = err.data as { error?: string } | null;
    if (payload?.error) return payload.error;
    if (err.message) return err.message;
    return "Failed to create server";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Failed to create server";
}

async function fetchMojangVersions(): Promise<MojangVersion[]> {
  const res = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
  const data = await res.json();
  return (data.versions ?? []) as MojangVersion[];
}

function resolveLatestReleaseVersion(versions: MojangVersion[]): string | null {
  if (versions.length === 0) return null;
  return versions.find((v) => v.type === "release")?.id ?? versions[0]?.id ?? null;
}

function normalizeToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function collectCrateTokens(crate: Crate): string[] {
  const rawTokens: unknown[] = [
    crate.category,
    crate.name,
    crate.id,
    crate.description,
    ...(Array.isArray(crate.tags) ? crate.tags : []),
  ];

  return rawTokens.map(normalizeToken).filter(Boolean);
}

function crateMatchesCategory(crate: Crate, category: CatalogCategory): boolean {
  const categoryDef = RESOURCE_CATEGORIES.find((item) => item.id === category);
  if (!categoryDef) return false;

  const aliases = categoryDef.aliases.map(normalizeToken).filter(Boolean);
  const crateTokens = collectCrateTokens(crate);

  return aliases.some((alias) => crateTokens.some((token) => token.includes(alias)));
}

function resolveCategoryIcon(crate: Crate): LucideIcon {
  for (const category of RESOURCE_CATEGORIES) {
    if (crateMatchesCategory(crate, category.id)) {
      return category.icon;
    }
  }
  return Boxes;
}

function isMinecraftCrate(crate: Crate | null): boolean {
  if (!crate) return false;

  const minecraftAliases = [
    "minecraft",
    "paper",
    "purpur",
    "spigot",
    "bukkit",
    "fabric",
    "forge",
    "neoforge",
    "bedrock",
  ].map(normalizeToken);

  const crateTokens = collectCrateTokens(crate);
  return minecraftAliases.some((alias) => crateTokens.some((token) => token.includes(alias)));
}

function humanizeID(id: string): string {
  return id
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferCategoryFromCrateID(crateID: string): CatalogCategory {
  const normalized = normalizeToken(crateID);

  for (const category of RESOURCE_CATEGORIES) {
    if (category.aliases.some((alias) => normalized.includes(normalizeToken(alias)))) {
      return category.id;
    }
  }

  return DEFAULT_CATEGORY;
}

function buildSyntheticCratesFromBlueprints(blueprints: Blueprint[]): Crate[] {
  const grouped = new Map<string, Blueprint[]>();

  for (const blueprint of blueprints) {
    if (!blueprint.crate_id) continue;
    const existing = grouped.get(blueprint.crate_id) ?? [];
    existing.push(blueprint);
    grouped.set(blueprint.crate_id, existing);
  }

  const now = new Date().toISOString();

  return Array.from(grouped.entries())
    .map(([crateID, crateBlueprints]) => {
      const first = crateBlueprints[0];
      const templateCount = crateBlueprints.length;

      return {
        id: crateID,
        name: humanizeID(crateID),
        category: inferCategoryFromCrateID(crateID),
        description:
          first?.description?.trim() ||
          `${templateCount} template${templateCount === 1 ? "" : "s"} available`,
        logo: first?.logo || "",
        tags: [crateID],
        official: true,
        created_at: now,
        updated_at: now,
      } satisfies Crate;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function mergeCrates(primary: Crate[], fallback: Crate[]): Crate[] {
  if (primary.length === 0) return fallback;
  if (fallback.length === 0) return primary;

  const byID = new Map<string, Crate>();

  for (const crate of fallback) {
    byID.set(crate.id, crate);
  }

  for (const crate of primary) {
    byID.set(crate.id, crate);
  }

  return Array.from(byID.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function loadFallbackCratesFromBlueprints(): Promise<Crate[]> {
  try {
    const blueprintRes = await listBlueprints("");
    const synthetic = buildSyntheticCratesFromBlueprints(blueprintRes.blueprints ?? []);
    if (synthetic.length > 0) {
      return synthetic;
    }
  } catch {
    // Fall through to minecraft-specific fallback.
  }

  try {
    const minecraftBlueprintRes = await listBlueprints("minecraft");
    return buildSyntheticCratesFromBlueprints(minecraftBlueprintRes.blueprints ?? []);
  } catch {
    return [];
  }
}

// Dark styled input for the modal
function DarkInput({
  id,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
}: {
  id?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="h-12 w-full rounded-[0.3rem] border border-white/12 bg-black/25 px-4 text-sm text-[var(--test-foreground)] placeholder:text-[var(--test-muted)] focus-visible:ring-[#f5b517]/25 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

function DarkLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--test-foreground)]">
      {children}
    </Label>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
  mojangVersions,
  showSnapshots,
  onToggleSnapshots,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
  mojangVersions?: MojangVersion[];
  showSnapshots?: boolean;
  onToggleSnapshots?: () => void;
}) {
  if (mojangVersions && mojangVersions.length > 0) {
    const filtered = showSnapshots
      ? mojangVersions
      : mojangVersions.filter((v) => v.type === "release");

    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <DarkLabel htmlFor={field.key}>{field.label}</DarkLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleSnapshots}
            className="h-6 px-2 text-[11px] text-white/50 hover:bg-white/8 hover:text-white/80"
          >
            {showSnapshots ? "Hide snapshots" : "Show snapshots"}
          </Button>
        </div>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={field.key} className="h-12 rounded-[0.3rem] border border-white/12 bg-black/25 px-4 text-[var(--test-foreground)]">
            <SelectValue placeholder="Select version…" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            {filtered.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.id}
                {v.type === "snapshot" && (
                  <span className="ml-1.5 text-xs text-muted-foreground">snapshot</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div>
      <DarkLabel htmlFor={field.key}>
        {field.label}{field.required && <span className="ml-0.5 text-red-400">*</span>}
      </DarkLabel>
      {field.description && (
        <p className="mb-1.5 text-xs text-muted-foreground">{field.description}</p>
      )}
      {field.type === "select" && field.options ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={field.key} className="h-12 rounded-[0.3rem] border border-white/12 bg-black/25 px-4 text-[var(--test-foreground)]">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <DarkInput
          id={field.key}
          type={field.type === "secret" ? "password" : field.type === "number" ? "number" : "text"}
          value={value}
          onChange={onChange}
          required={field.required}
        />
      )}
    </div>
  );
}

export function NewServerSheet({ open, onOpenChange, projectID, namespaceSlug, scope, onCreated, activeServerNames = [], floating = false }: NewServerSheetProps) {
  const [step, setStep] = useState<Step>("catalog");
  const [createQuery, setCreateQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CatalogCategory | null>(null);
  const [crates, setCrates] = useState<Crate[]>([]);
  const [loadingCrates, setLoadingCrates] = useState(false);
  const [selectedCrate, setSelectedCrate] = useState<Crate | null>(null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [serverName, setServerName] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [memoryMB, setMemoryMB] = useState(2048);
  const [cpuMillicores, setCpuMillicores] = useState(1000);
  const [mojangVersions, setMojangVersions] = useState<MojangVersion[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const normalizedServerName = serverName.trim().toLowerCase();
  const normalizedQuery = createQuery.trim().toLowerCase();
  const nameConflict = normalizedServerName !== "" && activeServerNames.some((name) => name.trim().toLowerCase() === normalizedServerName);
  const nameInvalid = serverName.trim() !== "" && !/^[a-zA-Z0-9][a-zA-Z0-9_.\-]*$/.test(serverName.trim());
  const requiredFieldsFilled = selectedBlueprint
    ? selectedBlueprint.config.filter((f) => f.required).every((f) => (configValues[f.key] ?? "").trim() !== "")
    : true;

  const categorySearchResults = useMemo(() => {
    if (!normalizedQuery) return RESOURCE_CATEGORIES;

    return RESOURCE_CATEGORIES.filter((category) => {
      const haystack = `${category.label} ${category.description} ${category.aliases.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const categoryCounts = useMemo(() => {
    return RESOURCE_CATEGORIES.reduce((acc, category) => {
      let categoryCrates = crates.filter((crate) => crateMatchesCategory(crate, category.id));

      if (category.id === "games") {
        categoryCrates = categoryCrates.filter((crate) => isMinecraftCrate(crate));
      }

      acc[category.id] = categoryCrates.length;
      return acc;
    }, {} as Record<CatalogCategory, number>);
  }, [crates]);

  const filteredCrates = useMemo(() => {
    if (!selectedCategory) return [];

    let categoryCrates = crates.filter((crate) => crateMatchesCategory(crate, selectedCategory));

    // Current game offering is intentionally limited to Minecraft variants.
    if (selectedCategory === "games") {
      categoryCrates = categoryCrates.filter((crate) => isMinecraftCrate(crate));
    }

    return categoryCrates;
  }, [crates, selectedCategory]);

  const queryFilteredCrates = useMemo(() => {
    if (!selectedCategory) return [];
    if (!normalizedQuery) return filteredCrates;

    return filteredCrates.filter((crate) => {
      const haystack = [
        crate.name,
        crate.description,
        crate.id,
        crate.category,
        ...(Array.isArray(crate.tags) ? crate.tags : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [selectedCategory, filteredCrates, normalizedQuery]);

  const selectedCategoryMeta = useMemo(
    () => RESOURCE_CATEGORIES.find((category) => category.id === selectedCategory) ?? null,
    [selectedCategory],
  );

  useEffect(() => {
    if (!open) {
      setStep("catalog");
      setCreateQuery("");
      setSelectedCategory(null);
      setSelectedCrate(null);
      setSelectedBlueprint(null);
      setBlueprints([]);
      setServerName("");
      setConfigValues({});
      setMemoryMB(2048);
      setCpuMillicores(1000);
      setMojangVersions([]);
      setShowSnapshots(false);
      setSubmitError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadCatalog = async () => {
      setLoadingCrates(true);

      try {
        const [crateResult, fallbackCrates] = await Promise.all([
          listCrates().catch(() => null),
          loadFallbackCratesFromBlueprints(),
        ]);

        const apiCrates = crateResult?.crates ?? [];
        const nextCrates = mergeCrates(apiCrates, fallbackCrates);

        if (!cancelled) {
          setCrates(nextCrates);
          if (nextCrates.length === 0) {
            toast.error("Failed to load catalog");
          }
        }
      } catch {
        if (!cancelled) {
          toast.error("Failed to load catalog");
        }
      } finally {
        if (!cancelled) {
          setLoadingCrates(false);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function selectCategory(category: CatalogCategory) {
    setSelectedCategory(category);
    setCreateQuery("");
    setSelectedCrate(null);
    setSelectedBlueprint(null);
    setBlueprints([]);
    setConfigValues({});
  }

  function exitCategorySelection() {
    setSelectedCategory(null);
    setCreateQuery("");
  }

  function selectCrate(crate: Crate) {
    setSelectedCrate(crate);
    setLoadingBlueprints(true);
    setBlueprints([]);
    setStep("blueprint");
    listBlueprints(crate.id)
      .then((res) => setBlueprints(res.blueprints ?? []))
      .catch(() => toast.error("Failed to load templates"))
      .finally(() => setLoadingBlueprints(false));
  }

  function selectBlueprint(bp: Blueprint) {
    setSelectedBlueprint(bp);
    const defaults = buildDefaults(bp.config);
    if (bp.constructs && Object.keys(bp.constructs).length > 0) {
      defaults["IMAGE"] = Object.keys(bp.constructs)[0];
    }
    setConfigValues(defaults);
    setMemoryMB(nearestMemoryOption(bp.resources.memory_mb));
    setCpuMillicores(nearestCPUOption(bp.resources.cpu_millicores));
    setStep("config");
    if (isMinecraftCrate(selectedCrate) && bp.config.some((field) => field.key === "VERSION")) {
      fetchMojangVersions()
        .then((versions) => {
          setMojangVersions(versions);
          const latestVersion = resolveLatestReleaseVersion(versions);
          if (!latestVersion) return;
          setConfigValues((prev) => {
            if (prev.VERSION === undefined || prev.VERSION === latestVersion) return prev;
            return { ...prev, VERSION: latestVersion };
          });
        })
        .catch(() => {});
    }
  }

  function setField(key: string, value: string) {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBlueprint || !serverName.trim() || (!namespaceSlug && !projectID && !scope)) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let deploymentId = "";
      if (namespaceSlug) {
        const result = await provisionWorkloadForNamespace(namespaceSlug, {
          server_name: serverName.trim(),
          blueprint_id: selectedBlueprint.id,
          env_overrides: configValues,
          memory_bytes: memoryMB * 1024 * 1024,
          cpu_millicores: cpuMillicores,
        });
        deploymentId = result.deployment_id;
      } else {
        const result = await createDeployment(projectID ?? "", {
          blueprint_id: selectedBlueprint.id,
          server_name: serverName.trim(),
          config: configValues,
          resources: { memory_mb: memoryMB, cpu_millicores: cpuMillicores },
        }, scope);
        deploymentId = result.deployment_id;
      }
      toast.success("Node is being provisioned");
      onOpenChange(false);
      onCreated?.(deploymentId);
    } catch (err) {
      const message = extractErrorMessage(err);
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    if (step === "config") setStep("blueprint");
    else if (step === "blueprint") setStep("catalog");
    else if (step === "catalog" && selectedCategory) exitCategorySelection();
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={floating ? "contents" : "fixed inset-0 z-50 flex items-center justify-center bg-black/42 p-4 sm:p-6"}
          onClick={floating ? undefined : () => onOpenChange(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              "glass-panel relative flex flex-col overflow-hidden rounded-[0.75rem] border border-[#f5b517]/22 bg-[#090909] text-[var(--test-foreground)] shadow-[0_30px_80px_rgba(0,0,0,0.58)]",
              floating ? "pointer-events-auto w-[520px]" : "w-full max-w-[560px]"
            )}
            style={{ maxHeight: floating ? "min(680px, 80vh)" : "min(700px, 92vh)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(245,181,23,0.13),transparent_56%),linear-gradient(180deg,rgba(6,6,7,0.92),rgba(8,8,9,0.98))]" />

            {/* Close */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              className="absolute right-4 top-4 z-20 text-muted-foreground hover:bg-white/10 hover:text-[var(--test-foreground)]"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="relative z-10 flex min-h-0 flex-1 flex-col">
              <div className={cn(
                "border-b border-[#f5b517]/18 px-5 py-4 pr-12 sm:px-6",
                floating && "wizard-drag-handle cursor-grab active:cursor-grabbing select-none"
              )}>
                <div className="flex items-start gap-2">
                  {step !== "catalog" || selectedCategory ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={goBack}
                      className="mt-0.5 mr-1 rounded-[0.25rem] text-muted-foreground hover:bg-white/10 hover:text-[var(--test-foreground)]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  ) : null}

                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-tight text-[var(--test-foreground)]">
                      {step === "catalog"
                        ? selectedCategoryMeta?.label ?? "Add a node"
                        : step === "blueprint"
                            ? `${selectedCrate?.name ?? "Resource"} templates`
                            : "Configure node"}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--test-muted)]">
                      {step === "catalog"
                        ? selectedCategoryMeta
                            ? `Choose a ${selectedCategoryMeta.label.toLowerCase()} resource`
                            : "What would you like to create?"
                        : step === "blueprint"
                            ? "Select deployment template"
                            : `Setting up ${selectedBlueprint?.name}`}
                    </p>
                  </div>
                </div>
              </div>

              {step === "catalog" ? (
                <div className="kleff-scrollbar-subtle flex-1 overflow-y-auto px-5 py-5 pr-3 sm:px-6">
                  <div className="space-y-4">
                    <div className="flex h-12 items-center gap-2 rounded-[0.3rem] border border-[#f5b517]/30 bg-black/30 px-3">
                      <Search className="h-3.5 w-3.5 text-[#f6d274]/85" />
                      <Input
                        value={createQuery}
                        onChange={(e) => setCreateQuery(e.target.value)}
                        placeholder="What would you like to create?"
                        className="h-9 border-none bg-transparent px-0 text-sm text-white placeholder:text-white/45 focus-visible:ring-0"
                      />
                    </div>

                    {!selectedCategory ? (
                      <div className="space-y-2">
                        {categorySearchResults.map((category) => {
                          const Icon = category.icon;
                          const count = categoryCounts[category.id] ?? 0;

                          return (
                            <Card
                              key={category.id}
                              onClick={() => selectCategory(category.id)}
                              className="cursor-pointer gap-0 rounded-[0.3rem] border border-white/12 bg-black/28 py-0 shadow-none ring-0 transition-all duration-150 hover:border-[#f5b517]/45 hover:bg-[#f5b517]/10"
                            >
                              <CardContent className="flex items-center gap-3 p-3">
                                <Icon className="h-4 w-4 text-white/75" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--test-foreground)]">{category.label}</p>
                                  <p className="mt-0.5 text-[11px] text-[var(--test-muted)]">
                                    {count > 0 ? `${count} available` : "Coming soon"}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                              </CardContent>
                            </Card>
                          );
                        })}

                        {categorySearchResults.length === 0 ? (
                          <div className="rounded-[0.3rem] border border-white/10 bg-black/24 px-4 py-8 text-center">
                            <p className="text-sm text-muted-foreground">No categories match your search.</p>
                          </div>
                        ) : null}
                      </div>
                    ) : loadingCrates ? (
                      <div className="px-2 py-8 text-center text-sm text-muted-foreground">Loading catalog...</div>
                    ) : queryFilteredCrates.length === 0 ? (
                      <div className="rounded-[0.3rem] border border-white/10 bg-black/24 px-4 py-8 text-center">
                        {selectedCategory === "games" ? (
                          <>
                            <p className="text-sm text-muted-foreground">Only Minecraft is currently available for Games.</p>
                            <p className="mt-1 text-xs text-muted-foreground/80">If it is missing, wait for catalog sync and reopen this modal.</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm text-muted-foreground">No resources available in this category yet.</p>
                            <p className="mt-1 text-xs text-muted-foreground/80">Try another category.</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {queryFilteredCrates.map((crate) => {
                          const CategoryIcon = resolveCategoryIcon(crate);

                          return (
                            <Card
                              key={crate.id}
                              onClick={() => selectCrate(crate)}
                              className="cursor-pointer gap-0 rounded-[0.3rem] border border-white/12 bg-black/28 py-0 shadow-none ring-0 transition-all duration-150 hover:border-[#f5b517]/45 hover:bg-[#f5b517]/10"
                            >
                              <CardContent className="flex items-center gap-3 p-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.2rem] border border-white/12 bg-black/35">
                                  {crate.logo ? (
                                    <img src={crate.logo} alt={crate.name} className="h-4.5 w-4.5 object-contain" />
                                  ) : (
                                    <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-[var(--test-foreground)]">{crate.name}</p>
                                  {crate.description ? (
                                    <p className="mt-0.5 truncate text-[11px] text-[var(--test-muted)]">{crate.description}</p>
                                  ) : null}
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {step === "blueprint" ? (
                <div className="kleff-scrollbar-subtle flex-1 overflow-y-auto px-5 py-5 pr-3 sm:px-6">
                  {loadingBlueprints ? (
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">Loading templates...</div>
                  ) : blueprints.length === 0 ? (
                    <div className="px-2 py-8 text-center text-sm text-muted-foreground">No templates available.</div>
                  ) : (
                    <div className="space-y-2">
                      {blueprints.map((bp) => (
                        <Card
                          key={bp.id}
                          onClick={() => selectBlueprint(bp)}
                          className="cursor-pointer gap-0 rounded-[0.3rem] border border-white/12 bg-black/26 py-0 shadow-none ring-0 transition-all duration-150 hover:border-[#f5b517]/45 hover:bg-[#f5b517]/10"
                        >
                          <CardContent className="flex items-center gap-3 p-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.2rem] border border-white/12 bg-black/35">
                              <Server className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[var(--test-foreground)]">{bp.name}</p>
                              {bp.description ? (
                                <p className="mt-0.5 truncate text-[11px] text-[var(--test-muted)]">{bp.description}</p>
                              ) : null}
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {step === "config" && selectedBlueprint ? (
                <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
                  <div className="kleff-scrollbar-subtle flex-1 overflow-y-auto px-5 py-5 pr-3 sm:px-6">
                    <div className="space-y-5">
                      <div className="rounded-[0.3rem] border border-[#f5b517]/25 bg-[rgba(28,21,8,0.6)] px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#f6d274]">Blueprint</p>
                        <p className="mt-1 text-sm font-medium text-[var(--test-foreground)]">
                          {selectedCrate?.name ?? "Resource"} / {selectedBlueprint.name}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <DarkLabel htmlFor="server-name">Node name <span className="text-red-400">*</span></DarkLabel>
                        <DarkInput
                          id="server-name"
                          value={serverName}
                          onChange={setServerName}
                          placeholder="my-node"
                          required
                        />
                      </div>

                      {selectedBlueprint.constructs && Object.keys(selectedBlueprint.constructs).length > 1 ? (
                        <div className="space-y-2">
                          <DarkLabel htmlFor="construct-select">Runtime</DarkLabel>
                          <Select
                            value={configValues["IMAGE"] ?? ""}
                            onValueChange={(v) => setField("IMAGE", v)}
                          >
                            <SelectTrigger id="construct-select" className="h-11 rounded-[0.35rem] border border-white/12 bg-black/25 px-3.5 text-[var(--test-foreground)]">
                              <SelectValue placeholder="Select runtime..." />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(selectedBlueprint.constructs).map((label) => (
                                <SelectItem key={label} value={label}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}

                      <div className="space-y-4">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#f6d274]/80">Template settings</p>
                        {selectedBlueprint.config.map((field) => (
                          <ConfigFieldInput
                            key={field.key}
                            field={field}
                            value={configValues[field.key] ?? ""}
                            onChange={(v) => setField(field.key, v)}
                            mojangVersions={field.key === "VERSION" && isMinecraftCrate(selectedCrate) ? mojangVersions : undefined}
                            showSnapshots={showSnapshots}
                            onToggleSnapshots={() => setShowSnapshots((v) => !v)}
                          />
                        ))}
                      </div>

                      <div className="space-y-4 pt-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#f6d274]/80">Resources</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <DarkLabel htmlFor="memory">Memory</DarkLabel>
                            <Select value={String(memoryMB)} onValueChange={(v) => setMemoryMB(Number(v))}>
                              <SelectTrigger id="memory" className="h-11 rounded-[0.35rem] border border-white/12 bg-black/25 px-3.5 text-[var(--test-foreground)]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MEMORY_OPTIONS.map((o) => (
                                  <SelectItem key={o.mb} value={String(o.mb)}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <DarkLabel htmlFor="cpu">CPU</DarkLabel>
                            <Select value={String(cpuMillicores)} onValueChange={(v) => setCpuMillicores(Number(v))}>
                              <SelectTrigger id="cpu" className="h-11 rounded-[0.35rem] border border-white/12 bg-black/25 px-3.5 text-[var(--test-foreground)]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CPU_OPTIONS.map((o) => (
                                  <SelectItem key={o.millicores} value={String(o.millicores)}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {nameInvalid ? (
                        <p className="rounded-[0.3rem] border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                          Name can only contain letters, numbers, underscores, dots, and hyphens.
                        </p>
                      ) : null}
                      {nameConflict ? (
                        <p className="rounded-[0.3rem] border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                          A node with that name already exists.
                        </p>
                      ) : null}
                      {submitError ? (
                        <p className="rounded-[0.3rem] border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                          {submitError}
                        </p>
                      ) : null}
                      {!projectID && !scope ? (
                        <p className="rounded-[0.3rem] border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                          Select an environment before creating a node.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#f5b517]/18 px-5 py-4 sm:px-6">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={goBack}
                      className="h-10 rounded-[0.3rem] border-white/15 bg-black/30 px-4 text-sm text-white/80 hover:bg-white/8"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        !serverName.trim() ||
                        nameConflict ||
                        nameInvalid ||
                        submitting ||
                        !requiredFieldsFilled ||
                        (!namespaceSlug && !projectID && !scope)
                      }
                      className="h-10 rounded-[0.3rem] bg-gradient-kleff px-4 text-primary-foreground text-sm font-semibold shadow-[0_12px_28px_rgba(196,143,0,0.2)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {submitting ? "Creating..." : "Create node"}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
