"use client";

import { useParams } from "next/navigation";
import { NamespaceCanvasPage } from "@/features/namespaces/pages/NamespaceCanvasPage";

export default function CanvasPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <NamespaceCanvasPage namespaceSlug={slug} />
    </div>
  );
}
