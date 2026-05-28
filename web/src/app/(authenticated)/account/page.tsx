"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth";
import { useQuery } from "@tanstack/react-query";
import { listNamespaces } from "@/lib/api/namespaces";

export default function AccountPage() {
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
      const username =
        (auth.user?.profile?.preferred_username as string | undefined) ??
        (auth.user?.profile?.sub as string | undefined);
      if (username) router.replace(`/${username}/servers`);
    }
  }, [isLoading, data, router, auth.user]);

  return null;
}
