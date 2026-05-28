import { useQuery } from "@tanstack/react-query";
import { getMyPermissions } from "@/lib/api/namespaces";

export function useNamespacePermissions(slug: string | undefined, envId?: string) {
  const query = useQuery({
    queryKey: ["namespace-permissions", slug, envId],
    queryFn: () => (slug ? getMyPermissions(slug, envId) : Promise.resolve({ permissions: [] })),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const permissions = new Set(query.data?.permissions ?? []);

  return {
    permissions,
    hasPermission: (key: string) => permissions.has(key),
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
