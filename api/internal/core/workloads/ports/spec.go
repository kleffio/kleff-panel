package ports

// WorkloadSpec is the daemon queue payload for workload operations.
type WorkloadSpec struct {
	// Phase 1: NamespaceID is the authoritative tenancy key.
	// The daemon uses it for per-namespace bridge networking and authorization.
	NamespaceID   string `json:"namespace_id"`
	NamespaceSlug string `json:"namespace_slug,omitempty"`

	OwnerID       string `json:"owner_id"`
	OwnerUsername string `json:"owner_username,omitempty"`
	ServerID      string `json:"server_id"`
	ServerName    string `json:"server_name,omitempty"`
	BlueprintID   string `json:"blueprint_id"`
	Image         string `json:"image"`

	// Legacy fields — kept for daemon backward-compat during rollout.
	// Phase 2 will remove these once all nodes have updated daemons.
	EnvironmentID string `json:"environment_id,omitempty"`
	ProjectID     string `json:"project_id,omitempty"`
	ProjectSlug   string `json:"project_slug,omitempty"`

	BlueprintVersion string            `json:"blueprint_version,omitempty"`
	EnvOverrides     map[string]string `json:"env_overrides,omitempty"`
	MemoryBytes      int64             `json:"memory_bytes,omitempty"`
	CPUMillicores    int64             `json:"cpu_millicores,omitempty"`
	PortRequirements []PortRequirement `json:"port_requirements,omitempty"`
	RuntimeHints     RuntimeHints      `json:"runtime_hints,omitempty"`
}

type PortRequirement struct {
	TargetPort int    `json:"target_port"`
	Protocol   string `json:"protocol"`
}

type RuntimeHints struct {
	KubernetesStrategy string `json:"kubernetes_strategy,omitempty"`
	ExposeUDP          bool   `json:"expose_udp,omitempty"`
	PersistentStorage  bool   `json:"persistent_storage,omitempty"`
	StoragePath        string `json:"storage_path,omitempty"`
	StorageGB          int    `json:"storage_gb,omitempty"`
}
