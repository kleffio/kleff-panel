"use client";

import { useSyncExternalStore } from "react";
import type { SlotName, SlotRegistration as BaseSlotRegistration } from "@kleffio/sdk";
import { pluginRegistry } from "@/features/plugins/lib/registry";

// SDK SlotRegistration doesn't yet define deduplication/grouping fields.
type SlotRegistration = BaseSlotRegistration & {
  provides?: string[];
  capturesProviding?: string[];
  group?: string;
};
import { PluginErrorBoundary } from "@/features/plugins/lib/PluginErrorBoundary";

// ─── PluginSlot ───────────────────────────────────────────────────────────────
// Pure injection point — renders plugin components registered for this slot.
// Does NOT accept children. Use <PluginWrapper> when default content is needed.
//
// Deduplication: registrations that declare `provides: string[]` participate in
// chart-ID deduplication. Higher-priority plugins claim their IDs first; any
// lower-priority plugin whose IDs are all claimed is skipped entirely.
//
// Grouping: when multiple plugins render into the same slot and any declares a
// `group` label, each group gets a subtle section header.

interface PluginSlotProps {
  name: SlotName;
  /** Extra props forwarded to every component in this slot. */
  slotProps?: Record<string, unknown>;
  /** When provided, renders as a div with this className instead of a fragment. */
  className?: string;
  /** When true, only the highest-priority registration is rendered. */
  exclusive?: boolean;
}

interface ResolvedRegistration {
  reg: SlotRegistration;
  extraProps?: Record<string, unknown>;
}

function deduplicateRegistrations(all: SlotRegistration[]): ResolvedRegistration[] {
  const claimed = new Set<string>();
  const result: ResolvedRegistration[] = [];

  // Collect all provides IDs declared by non-capturesProviding registrations so
  // capturesProviding entries can intersect against what actually exists.
  const allProvides = new Set<string>();
  for (const reg of all) {
    if (!reg.capturesProviding && reg.provides) {
      reg.provides.forEach((id) => allProvides.add(id));
    }
  }

  for (const reg of all) {
    if (reg.capturesProviding) {
      // Claim only the subset that another plugin actually registered and that
      // isn't already claimed by an even-higher-priority registration.
      const capturedProvides = reg.capturesProviding.filter(
        (id) => allProvides.has(id) && !claimed.has(id),
      );
      if (capturedProvides.length > 0) {
        result.push({ reg, extraProps: { capturedProvides } });
        capturedProvides.forEach((id) => claimed.add(id));
      }
      // If nothing matched, skip entirely (no other plugin provides these IDs).
    } else {
      const provides = reg.provides;
      if (!provides || provides.length === 0) {
        result.push({ reg });
      } else {
        const hasUnclaimed = provides.some((id) => !claimed.has(id));
        if (hasUnclaimed) {
          result.push({ reg });
          provides.forEach((id) => claimed.add(id));
        }
      }
    }
  }
  return result;
}

interface Group {
  label: string | undefined;
  registrations: ResolvedRegistration[];
}

function groupRegistrations(registrations: ResolvedRegistration[]): Group[] {
  const groups: Group[] = [];
  const seen = new Map<string, Group>();
  for (const resolved of registrations) {
    const key = resolved.reg.group ?? "__ungrouped__";
    if (!seen.has(key)) {
      const g: Group = { label: resolved.reg.group, registrations: [] };
      seen.set(key, g);
      groups.push(g);
    }
    seen.get(key)!.registrations.push(resolved);
  }
  return groups;
}

export function PluginSlot({ name, slotProps, className, exclusive }: PluginSlotProps) {
  useSyncExternalStore(
    pluginRegistry.subscribe.bind(pluginRegistry),
    pluginRegistry.getSnapshot.bind(pluginRegistry),
    pluginRegistry.getSnapshot.bind(pluginRegistry),
  );

  const all = pluginRegistry.getSlotRegistrations(name);
  const candidates = exclusive
    ? all.slice(0, 1).map((reg) => ({ reg }))
    : deduplicateRegistrations(all);
  const groups = groupRegistrations(candidates);
  const showHeaders = groups.length > 1 || (groups.length === 1 && groups[0].label !== undefined);

  const renderRegistrations = (resolved: ResolvedRegistration[]) =>
    resolved.map(({ reg, extraProps }, i) => {
      const Component = reg.component;
      if (!Component) return null;
      const mergedProps = { ...reg.props, ...slotProps, ...extraProps };
      return (
        <PluginErrorBoundary
          key={`${name}-${reg.group ?? ""}-${i}`}
          pluginId={String(mergedProps.pluginId ?? `slot-${name}-${i}`)}
        >
          <Component {...mergedProps} />
        </PluginErrorBoundary>
      );
    });

  const content = showHeaders ? (
    <div className="space-y-8">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi}>
          {g.label && (
            <p className="text-xs font-medium text-muted-foreground/40 uppercase tracking-widest mb-4">
              {g.label}
            </p>
          )}
          {renderRegistrations(g.registrations)}
        </div>
      ))}
    </div>
  ) : (
    <>{groups.flatMap((g) => renderRegistrations(g.registrations))}</>
  );

  if (className) return <div className={className}>{content}</div>;
  return <>{content}</>;
}
