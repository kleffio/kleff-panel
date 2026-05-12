"use client";

import { Check, CheckCircle, ChevronDown, ExternalLink, Lock, Package, Search, ShieldCheck, User } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@kleffio/ui";
import { useHasRole } from "@/features/auth";
import { useMarketplace } from "@/features/plugins/hooks/useMarketplace";
import { DepsSheet } from "@/features/plugins/ui/DepsSheet";
import { ConfigFieldInput } from "@/features/plugins/ui/ConfigFieldInput";
import { PLUGIN_TIER, TIER_META, TYPE_LABELS, type PluginTier } from "@/features/plugins/model/types";
import type { CatalogPlugin } from "@/lib/api/plugins";

// Infra plugins live at /admin/plugins. Personal plugins live at /settings/plugins.
const TIER_ORDER: PluginTier[] = ["project"];

const TIER_ICONS: Record<PluginTier, React.ElementType> = {
  infra:   ShieldCheck,
  project: Package,
  user:    User,
};

export function MarketplacePage() {
  const isAdmin = useHasRole("admin");
  const {
    plugins,
    installedIds,
    setInstalledIds,
    installing,
    uninstalling,
    activating,
    activeIDPId,
    actionError,
    configPlugin,
    setConfigPlugin,
    configValues,
    setConfigValues,
    configError,
    sheetMode,
    saving,
    advancedMode,
    setAdvancedMode,
    depsPlugin,
    setDepsPlugin,
    pendingAction,
    setPendingAction,
    search,
    setSearch,
    filterInstalled,
    setFilterInstalled,
    filterOfficial,
    setFilterOfficial,
    filtered,
    normalFields,
    advancedFields,
    hasAdvancedFields,
    withDepsCheck,
    openSheet,
    prefillEdit,
    openActivate,
    handleConfigSubmit,
    handleUninstall,
  } = useMarketplace();

  // Group filtered plugins by tier
  const byTier: Record<PluginTier, CatalogPlugin[]> = {
    infra:   filtered.filter((p) => (PLUGIN_TIER[p.type] ?? "project") === "infra"),
    project: filtered.filter((p) => (PLUGIN_TIER[p.type] ?? "project") === "project"),
    user:    filtered.filter((p) => (PLUGIN_TIER[p.type] ?? "project") === "user"),
  };

  function PluginCard({ plugin }: { plugin: CatalogPlugin }) {
    const isInstalled = installedIds.has(plugin.id);
    const isActiveIDP = activeIDPId === plugin.id;
    const isIDP = plugin.type === "idp";
    const tier = PLUGIN_TIER[plugin.type] ?? "project";
    const unmetDeps = (plugin.dependencies ?? []).filter((d) => !installedIds.has(d));
    const depsBlocked = unmetDeps.length > 0;
    const tierIsAdminOnly = TIER_META[tier].adminOnly;
    const canAct = tierIsAdminOnly ? isAdmin : true;

    return (
      <div className="flex flex-col rounded-xl border border-white/[0.07] bg-card hover:border-primary/25 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
        <div className="p-5 flex-1 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">{plugin.name}</p>
                <p className="text-[10px] text-muted-foreground">by {plugin.author}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {plugin.verified && <CheckCircle className="size-3.5 text-emerald-400" />}
              {isActiveIDP && (
                <Badge variant="default" className="text-[10px] bg-emerald-600 hover:bg-emerald-600 px-1.5 py-0">
                  Active
                </Badge>
              )}
              {isInstalled && !isActiveIDP && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Installed</Badge>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {plugin.description}
          </p>

          {plugin.tags && plugin.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plugin.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {plugin.dependencies && plugin.dependencies.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plugin.dependencies.map((dep) => {
                const depPlugin = plugins.find((p) => p.id === dep);
                const depInstalled = installedIds.has(dep);
                return (
                  <Badge
                    key={dep}
                    variant={depInstalled ? "outline" : "destructive"}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {depInstalled && <Check className="mr-1 size-2.5" />}
                    {depPlugin?.name ?? dep}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06] bg-white/[0.015] px-5 py-3 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">v{plugin.version}</span>
          <div className="flex items-center gap-2">
            {!canAct && !isInstalled && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Lock className="size-3" /> Admin only
              </span>
            )}
            {canAct && isInstalled && (
              <Button
                size="sm"
                variant={isActiveIDP ? "ghost" : "destructive"}
                className={isActiveIDP ? "text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs" : "h-7 text-xs"}
                disabled={uninstalling === plugin.id || isActiveIDP}
                onClick={() => handleUninstall(plugin.id)}
              >
                {uninstalling === plugin.id ? "Removing…" : "Uninstall"}
              </Button>
            )}
            {canAct && isInstalled && (plugin.config ?? []).length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => prefillEdit(plugin)}>
                Edit
              </Button>
            )}
            {canAct && isIDP && isInstalled && !isActiveIDP && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                disabled={activating === plugin.id}
                onClick={() => withDepsCheck(plugin, () => openActivate(plugin))}
              >
                {activating === plugin.id ? "Activating…" : "Activate"}
              </Button>
            )}
            {canAct && !isInstalled && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                disabled={installing === plugin.id}
                onClick={() => withDepsCheck(plugin, () => openSheet(plugin, "install"))}
              >
                {installing === plugin.id ? "Installing…" : depsBlocked ? "Install…" : "Install"}
              </Button>
            )}
            {plugin.verified && (
              <a
                href="https://github.com/kleffio/plugins"
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plugins</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Extend your environments and personal workspace with plugins.
          Infrastructure plugins are managed in <a href="/admin-panel/plugins" className="text-primary underline underline-offset-2 hover:text-primary/80">Admin → Plugins</a>.
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search plugins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm bg-card border-border"
          />
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant={filterInstalled ? "default" : "outline"}
            className="h-9 text-xs"
            onClick={() => setFilterInstalled((v) => !v)}
          >
            Installed
          </Button>
          <Button
            size="sm"
            variant={filterOfficial ? "default" : "outline"}
            className="h-9 text-xs"
            onClick={() => setFilterOfficial((v) => !v)}
          >
            Official
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      {/* Tiered sections */}
      {TIER_ORDER.map((tier) => {
        const meta = TIER_META[tier];
        const tierPlugins = byTier[tier];
        const TierIcon = TIER_ICONS[tier];

        return (
          <section key={tier} className="space-y-4">
            {/* Section header */}
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-lg bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
                <TierIcon className="size-4 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">{meta.label}</h2>
                  {meta.adminOnly && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-muted-foreground/30">
                      <Lock className="size-2.5 mr-1" />
                      Admin only
                    </Badge>
                  )}
                  {tierPlugins.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {tierPlugins.length}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
              </div>
            </div>

            {tierPlugins.length === 0 ? (
              <div className="rounded-xl border border-border border-dashed bg-card/40 px-6 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {search || filterInstalled || filterOfficial
                    ? "No plugins match your filters in this tier."
                    : `No ${meta.label.toLowerCase()} plugins available yet.`}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tierPlugins.map((plugin) => (
                  <PluginCard key={plugin.id} plugin={plugin} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Dependency sheet */}
      <DepsSheet
        plugin={depsPlugin}
        catalog={plugins}
        installedIds={installedIds}
        onDepInstalled={(id) => {
          setInstalledIds((s) => new Set(s).add(id));
          window.dispatchEvent(new Event("kleff-reload-plugins"));
        }}
        onClose={() => { setDepsPlugin(null); setPendingAction(null); }}
        onContinue={() => { pendingAction?.(); setPendingAction(null); }}
      />

      {/* Config sheet */}
      <Sheet open={!!configPlugin} onOpenChange={(open) => { if (!open) setConfigPlugin(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "edit"
                ? `Edit ${configPlugin?.name}`
                : sheetMode === "activate"
                ? `Activate ${configPlugin?.name}`
                : `Install ${configPlugin?.name}`}
            </SheetTitle>
            <SheetDescription>
              {sheetMode === "edit"
                ? "Update the plugin configuration. Leave secret fields blank to keep current values."
                : sheetMode === "activate"
                ? "Fill in the configuration to activate this identity provider."
                : "Fill in the required configuration to install this plugin."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleConfigSubmit} className="flex flex-col gap-4 px-4 py-2">
            {normalFields.map((field) => (
              <ConfigFieldInput
                key={field.key}
                field={field}
                value={configValues[field.key] ?? ""}
                onChange={(v) => setConfigValues((prev) => ({ ...prev, [field.key]: v }))}
              />
            ))}

            {hasAdvancedFields && (
              <div className="space-y-4 pt-1">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
                  onClick={() => setAdvancedMode((v) => !v)}
                >
                  <ChevronDown className={`size-3.5 transition-transform ${advancedMode ? "rotate-180" : ""}`} />
                  {advancedMode ? "Hide advanced settings" : "Show advanced settings"}
                </button>
                {advancedMode && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {advancedFields.map((field) => (
                      <ConfigFieldInput
                        key={field.key}
                        field={field}
                        value={configValues[field.key] ?? ""}
                        onChange={(v) => setConfigValues((prev) => ({ ...prev, [field.key]: v }))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {configError && <p className="text-sm text-destructive">{configError}</p>}

            <SheetFooter className="px-0 pt-2">
              <Button
                type="submit"
                disabled={activating === configPlugin?.id || installing === configPlugin?.id || saving}
                className="w-full"
              >
                {sheetMode === "edit"
                  ? saving ? "Saving…" : "Save changes"
                  : sheetMode === "activate"
                  ? activating === configPlugin?.id ? "Activating…" : "Activate"
                  : installing === configPlugin?.id ? "Installing…" : "Install"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
