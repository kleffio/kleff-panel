import { get } from "./request";

export interface ConfigField {
  key: string;
  label: string;
  description?: string;
  type: "string" | "number" | "boolean" | "select" | "secret";
  options?: string[];
  default?: string | number | boolean;
  required: boolean;
  auto_generate?: boolean;
  auto_generate_length?: number;
}

export interface Crate {
  id: string;
  name: string;
  category: string;
  description: string;
  logo: string;
  tags: string[];
  official: boolean;
  created_at: string;
  updated_at: string;
}

export interface Blueprint {
  id: string;
  crate_id: string;
  construct_id: string;
  name: string;
  description: string;
  logo: string;
  background: string;
  version: string;
  official: boolean;
  constructs?: Record<string, string>;
  config: ConfigField[];
  resources: {
    memory_mb: number;
    cpu_millicores: number;
    disk_gb: number;
  };
}

export function listCrates(category?: string) {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  return get<{ crates: Crate[] }>(`/api/v1/crates${params}`);
}

export function listBlueprints(crateId: string) {
  return get<{ blueprints: Blueprint[] }>(`/api/v1/blueprints?crate=${encodeURIComponent(crateId)}`);
}

export function listAllBlueprints() {
  return get<{ blueprints: Blueprint[] }>(`/api/v1/blueprints`);
}
