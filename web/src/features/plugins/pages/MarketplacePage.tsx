"use client";

import { Check, CheckCircle, ChevronDown, ExternalLink, Lock, Package, Search } from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { PLUGIN_TIER, TIER_META } from "@/features/plugins/model/types";
import type { CatalogPlugin } from "@/lib/api/plugins";

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

  const projectPlugins = filtered.filter((plugin) => (PLUGIN_TIER[plugin.type] ?? "project") === "project");
  const hasActiveFilters = filterInstalled || filterOfficial;
  const allFilterActive = !hasActiveFilters;

  function clearFilters() {
    setFilterInstalled(false);
    setFilterOfficial(false);
  }

  function emptyMessage() {
    if (search.trim() || hasActiveFilters) {
      return "No plugins match your search.";
    }

    return "No project plugins available yet.";
  }

  function PluginResult({ plugin }: { plugin: CatalogPlugin }) {
    const isInstalled = installedIds.has(plugin.id);
    const isActiveIDP = activeIDPId === plugin.id;
    const isIDP = plugin.type === "idp";
    const tier = PLUGIN_TIER[plugin.type] ?? "project";
    const unmetDeps = (plugin.dependencies ?? []).filter((dependency) => !installedIds.has(dependency));
    const depsBlocked = unmetDeps.length > 0;
    const tierIsAdminOnly = TIER_META[tier].adminOnly;
    const canAct = tierIsAdminOnly ? isAdmin : true;

    return (
      <div
        data-frosted="true"
        className="overview-glass-card flex flex-col gap-4 rounded-2xl px-4 py-4 hover:border-primary/20 hover:bg-white/[0.035] sm:px-5 lg:flex-row lg:items-start lg:gap-5"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary shadow-[0_0_22px_rgba(245,181,23,0.08)]">
            <Package className="size-4" />
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold leading-tight text-white/90">{plugin.name}</h2>
              <span className="text-[11px] text-white/35">by {plugin.author}</span>
              {plugin.verified && <CheckCircle className="size-3.5 text-emerald-400" />}
              {isActiveIDP && (
                <Badge variant="default" className="bg-emerald-600 px-1.5 py-0 text-[10px] hover:bg-emerald-600">
                  Active
                </Badge>
              )}
              {isInstalled && !isActiveIDP && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Installed
                </Badge>
              )}
            </div>

            <p className="max-w-3xl text-sm leading-6 text-white/50">{plugin.description}</p>

            <div className="flex flex-wrap items-center gap-1.5">
              {plugin.tags?.slice(0, 3).map((tag) => (
                <span key={tag} className="ui-shine-chip">
                  <span className="ui-shine-chip__content">{tag}</span>
                </span>
              ))}
              <span className="text-[11px] text-white/30">v{plugin.version}</span>
            </div>

            {plugin.dependencies && plugin.dependencies.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {plugin.dependencies.map((dependency) => {
                  const depPlugin = plugins.find((candidate) => candidate.id === dependency);
                  const depInstalled = installedIds.has(dependency);

                  return (
                    <Badge
                      key={dependency}
                      variant={depInstalled ? "outline" : "destructive"}
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {depInstalled && <Check className="mr-1 size-2.5" />}
                      {depPlugin?.name ?? dependency}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:min-w-[13rem] lg:justify-end">
          {!canAct && !isInstalled && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Lock className="size-3" /> Admin only
            </span>
          )}
          {canAct && isInstalled && (
            <Button
              size="sm"
              variant={isActiveIDP ? "ghost" : "destructive"}
              className={
                isActiveIDP
                  ? "h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                  : "h-8 text-xs"
              }
              disabled={uninstalling === plugin.id || isActiveIDP}
              onClick={() => handleUninstall(plugin.id)}
            >
              {uninstalling === plugin.id ? "Removing..." : "Uninstall"}
            </Button>
          )}
          {canAct && isInstalled && (plugin.config ?? []).length > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => prefillEdit(plugin)}>
              Edit
            </Button>
          )}
          {canAct && isIDP && isInstalled && !isActiveIDP && (
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs"
              disabled={activating === plugin.id}
              onClick={() => withDepsCheck(plugin, () => openActivate(plugin))}
            >
              {activating === plugin.id ? "Activating..." : "Activate"}
            </Button>
          )}
          {canAct && !isInstalled && (
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs"
              disabled={installing === plugin.id}
              onClick={() => withDepsCheck(plugin, () => openSheet(plugin, "install"))}
            >
              {installing === plugin.id ? "Installing..." : depsBlocked ? "Install..." : "Install"}
            </Button>
          )}
          {plugin.verified && (
            <a
              href="https://github.com/kleffio/plugins"
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
              aria-label={`Open ${plugin.name} source`}
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-0 mx-auto w-full max-w-7xl animate-in fade-in px-4 pb-12 duration-500 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-kleff-grid [mask-image:radial-gradient(ellipse_70%_70%_at_50%_0%,#000_40%,transparent_100%)] opacity-30" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 top-72 -z-10 h-[24rem] w-[24rem] rounded-full bg-blue-500/5 blur-[100px]" />
      <div className="pointer-events-none absolute -left-20 top-[28rem] -z-10 h-[24rem] w-[24rem] rounded-full bg-purple-500/5 blur-[100px]" />

      <section className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-2 pt-6 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary/80">Extensions</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl">Plugins</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
          Extend your projects and personal workspace with plugins. Infrastructure plugins are managed in{" "}
          <a href="/admin/plugins" className="text-primary underline underline-offset-2 hover:text-primary/80">
            Admin - Plugins
          </a>.
        </p>

        <div className="mt-7 w-full">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/35" />
              <Input
                placeholder="Search plugins"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="glass-panel-soft h-14 rounded-full border-white/[0.08] bg-transparent pl-11 pr-5 text-base shadow-none placeholder:text-white/30 focus-visible:ring-primary/20"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="glass-panel-soft h-14 rounded-full border-white/[0.08] bg-transparent px-4 text-xs text-white/65 shadow-none hover:border-primary/20 hover:bg-white/[0.035] hover:text-white/85 sm:min-w-32"
                >
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                      {(filterInstalled ? 1 : 0) + (filterOfficial ? 1 : 0)}
                    </span>
                  )}
                  <ChevronDown className="ml-1.5 size-3.5 text-white/35" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="glass-panel-soft w-44 rounded-2xl border-white/[0.08] !bg-transparent !shadow-none"
              >
                <DropdownMenuLabel>Show</DropdownMenuLabel>
                <DropdownMenuItem onSelect={clearFilters} className="justify-between">
                  All
                  {allFilterActive && <Check className="size-3.5 text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={filterInstalled}
                  onCheckedChange={(checked) => setFilterInstalled(Boolean(checked))}
                >
                  Installed
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={filterOfficial}
                  onCheckedChange={(checked) => setFilterOfficial(Boolean(checked))}
                >
                  Official
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="mt-3 text-xs text-white/35">
            {projectPlugins.length} {projectPlugins.length === 1 ? "result" : "results"}
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto mt-8 max-w-5xl">
        {actionError && (
          <div data-frosted="true" className="overview-glass-card mb-3 rounded-2xl border-destructive/40 px-4 py-3 text-sm text-destructive">
            {actionError}
          </div>
        )}

        {projectPlugins.length === 0 ? (
          <div data-frosted="true" className="overview-glass-card rounded-2xl border-dashed px-6 py-14 text-center">
            <p className="text-sm text-white/50">{emptyMessage()}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {projectPlugins.map((plugin) => (
              <PluginResult key={plugin.id} plugin={plugin} />
            ))}
          </div>
        )}
      </div>

      <DepsSheet
        plugin={depsPlugin}
        catalog={plugins}
        installedIds={installedIds}
        onDepInstalled={(id) => {
          setInstalledIds((current) => new Set(current).add(id));
          window.dispatchEvent(new Event("kleff-reload-plugins"));
        }}
        onClose={() => {
          setDepsPlugin(null);
          setPendingAction(null);
        }}
        onContinue={() => {
          pendingAction?.();
          setPendingAction(null);
        }}
      />

      <Sheet
        open={!!configPlugin}
        onOpenChange={(open) => {
          if (!open) setConfigPlugin(null);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
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
                onChange={(value) => setConfigValues((prev) => ({ ...prev, [field.key]: value }))}
              />
            ))}

            {hasAdvancedFields && (
              <div className="space-y-4 pt-1">
                <button
                  type="button"
                  className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setAdvancedMode((current) => !current)}
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
                        onChange={(value) => setConfigValues((prev) => ({ ...prev, [field.key]: value }))}
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
                  ? saving
                    ? "Saving..."
                    : "Save changes"
                  : sheetMode === "activate"
                    ? activating === configPlugin?.id
                      ? "Activating..."
                      : "Activate"
                    : installing === configPlugin?.id
                      ? "Installing..."
                      : "Install"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
