"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth";
import { useQuery } from "@tanstack/react-query";
import { listNamespaces } from "@/lib/api/namespaces";
import { Skeleton } from "@kleffio/ui";

export default function RootPage() {
  const router = useRouter();
  const auth = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["namespaces"],
    queryFn: listNamespaces,
    enabled: auth.isAuthenticated,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isLoading || !data) return;
    const personalNs = data.namespaces.find((ns) => ns.type === "user");
    if (personalNs) {
      router.replace(`/${personalNs.slug}/servers`);
    } else {
      // Fallback: use OIDC preferred_username
      const username =
        (auth.user?.profile?.preferred_username as string | undefined) ??
        (auth.user?.profile?.sub as string | undefined);
      if (username) router.replace(`/${username}/servers`);
    }
  }, [isLoading, data, router, auth.user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-48 space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}
