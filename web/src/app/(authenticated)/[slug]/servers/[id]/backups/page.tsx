"use client";

import { DatabaseBackup } from "lucide-react";

export default function ServerBackupsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-white/25">
      <DatabaseBackup className="h-8 w-8 opacity-40" />
      <p className="text-[13px]">Backups coming soon</p>
    </div>
  );
}
