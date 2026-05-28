"use client";

export function StackComingSoonPage({
  section,
}: {
  namespaceSlug: string;
  stackId: string;
  section: string;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="text-[13px] font-medium text-white/40">{section}</p>
        <p className="mt-1 text-[12px] text-white/20">Coming soon</p>
      </div>
    </div>
  );
}
