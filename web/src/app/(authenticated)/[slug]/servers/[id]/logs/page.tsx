"use client";

import { LogViewer } from "@/features/hosting/ui/LogViewer";
import { useServerContext } from "../_hooks/useServerContext";

export default function ServerLogsPage() {
  const { nsScope, workloadID } = useServerContext();
  return <LogViewer projectID="" workloadId={workloadID} scope={nsScope} />;
}
