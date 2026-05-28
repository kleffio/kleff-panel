"use client";

import { Package } from "lucide-react";

export default function ServerModsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-white/25">
      <Package className="h-8 w-8 opacity-40" />
      <p className="text-[13px]">Mods coming soon</p>
    </div>
  );
}
