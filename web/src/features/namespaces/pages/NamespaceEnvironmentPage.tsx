"use client";

/**
 * NamespaceEnvironmentPage — Phase 1
 *
 * The old "Advanced Mode" (useUserUIMode) branch has been removed.
 * All users now see the same flat SimpleServersPage.
 * The environment slug is still accepted from the URL so that existing
 * links and 301 redirects (Phase 2) continue to work without 404s,
 * but it is passed through to SimpleServersPage which uses it only to
 * pick the correct environment for the legacy API path — Phase 2 will
 * remove that dependency entirely once servers live at the namespace level.
 */

import { useParams } from "next/navigation";
import { SimpleServersPage } from "@/features/hosting/pages/SimpleServersPage";

export function NamespaceEnvironmentPage() {
  const { slug, environment } = useParams<{ slug: string; environment: string }>();
  return <SimpleServersPage namespaceSlug={slug} environmentSlug={environment} />;
}
