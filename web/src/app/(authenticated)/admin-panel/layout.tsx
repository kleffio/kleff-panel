"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useHasRole } from "@/features/auth";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const isAdmin = useHasRole("admin");
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !isAdmin) {
      router.replace("/");
    }
  }, [auth.isLoading, isAdmin, router]);

  // Show nothing while auth loads or if role check fails (redirect will fire).
  if (auth.isLoading || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
