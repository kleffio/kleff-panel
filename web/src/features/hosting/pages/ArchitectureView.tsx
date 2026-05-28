import { InfrastructureFlowCanvas } from "@/features/hosting/ui/InfrastructureFlowCanvas";
import { ArchitectureThemeShell } from "@/components/layout/ArchitectureThemeShell";
import type { EnvironmentScope } from "@/lib/api/projects";
import type {
  InfrastructureEdge,
  InfrastructureNode,
} from "@/features/hosting/model/types";

export function ArchitectureView({
  infrastructureNodes,
  infrastructureEdges,
  projectID,
  scope,
  projectName,
  activeServerNames,
  onRequestRefresh,
  onDeleteEdge,
  onDeleteNode,
  onPersistNodePosition,
  simulateMetrics,
  readOnly,
}: {
  infrastructureNodes: InfrastructureNode[];
  infrastructureEdges: InfrastructureEdge[];
  projectID?: string | null;
  scope?: EnvironmentScope;
  projectName?: string;
  activeServerNames?: string[];
  onRequestRefresh?: () => void;
  onDeleteEdge?: (edgeID: string) => Promise<void> | void;
  onDeleteNode?: (nodeID: string) => Promise<void> | void;
  onPersistNodePosition?: (nodeID: string, position: { x: number; y: number }) => void;
  simulateMetrics?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className="h-full min-h-[720px] overflow-hidden">
      <ArchitectureThemeShell>
        <InfrastructureFlowCanvas
          infrastructureNodes={infrastructureNodes}
          infrastructureEdges={infrastructureEdges}
          projectID={projectID}
          scope={scope}
          projectName={projectName}
          activeServerNames={activeServerNames}
          onRequestRefresh={onRequestRefresh}
          onDeleteEdge={onDeleteEdge}
          onDeleteNode={onDeleteNode}
          onPersistNodePosition={onPersistNodePosition}
          simulateMetrics={simulateMetrics}
          readOnly={readOnly}
        />
      </ArchitectureThemeShell>
    </div>
  );
}
