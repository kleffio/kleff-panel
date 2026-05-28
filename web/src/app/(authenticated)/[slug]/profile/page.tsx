"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getNamespace } from "@/lib/api/namespaces";
import { AccountProfilePage } from "@/features/account/pages/AccountProfilePage";
import { Loader2 } from "lucide-react";

export default function Page() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: ns, isLoading } = useQuery({
    queryKey: ["namespace", slug],
    queryFn: () => getNamespace(slug),
  });

  useEffect(() => {
    if (ns?.type === "org") router.replace(`/${slug}`);
  }, [ns, slug, router]);

  if (isLoading || !ns || ns.type === "org") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  return <AccountProfilePage />;
}
