"use client";

import { ShieldCheck } from "lucide-react";

export function AccountSecurityPage() {
  return (
    <div className="animate-in fade-in duration-300 mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pb-20 pt-6">
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/[0.07] p-16 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <ShieldCheck className="size-5 text-white/25" />
        </div>
        <div>
          <p className="text-[13px] font-medium text-white/50">Security settings</p>
          <p className="text-[11px] text-white/25 mt-1">Password change and two-factor authentication coming soon.</p>
        </div>
      </div>
    </div>
  );
}
