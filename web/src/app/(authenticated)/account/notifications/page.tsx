"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth";

export default function AccountNotificationsRedirect() {
  const router = useRouter();
  const auth = useAuth();
  const username =
    (auth.user?.profile?.preferred_username as string | undefined) ??
    (auth.user?.profile?.sub as string | undefined);

  useEffect(() => {
    if (username) router.replace(`/${username}/notifications`);
  }, [username, router]);

  return null;
}
