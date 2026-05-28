"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const isSimplified = true;
  const router = useRouter();
  const pathname = usePathname();

  // Server instance pages are allowed in simplified mode — only block project-level pages.
  const isServerPage = /\/servers\/[^/]/.test(pathname);

  React.useEffect(() => {
    if (isSimplified && !isServerPage) {
      router.replace("/account/servers");
    }
  }, [isSimplified, isServerPage, router]);

  if (isSimplified && !isServerPage) return null;
  return <>{children}</>;
}
