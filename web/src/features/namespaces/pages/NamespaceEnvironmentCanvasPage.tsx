"use client";

import { useParams } from "next/navigation";
import { NamespaceCanvasPage } from "./NamespaceCanvasPage";

export function NamespaceEnvironmentCanvasPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <NamespaceCanvasPage namespaceSlug={slug} />
    </div>
  );
}
