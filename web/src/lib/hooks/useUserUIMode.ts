import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/api/profiles";
import type { UIMode } from "@/types/user";

const PROFILE_KEY = ["users", "me"] as const;

export function useUserUIMode(): UIMode {
  const { data } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getMyProfile,
    staleTime: 60_000,
  });
  return data?.data?.ui_mode ?? "advanced";
}
