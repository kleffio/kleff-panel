import { get, put, del } from "./request";

export interface CanvasGroupDTO {
  id: string;
  namespace_id: string;
  label: string;
  color: string;
  member_ids: string[];
  notes: string;
  role: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export function listCanvasGroups(namespaceSlug: string) {
  return get<{ groups: CanvasGroupDTO[] }>(
    `/api/v1/namespaces/${encodeURIComponent(namespaceSlug)}/canvas-groups`
  );
}

export function upsertCanvasGroup(
  namespaceSlug: string,
  id: string,
  payload: {
    label: string;
    color: string;
    member_ids: string[];
    notes: string;
    role: string;
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
  }
) {
  return put<CanvasGroupDTO, typeof payload>(
    `/api/v1/namespaces/${encodeURIComponent(namespaceSlug)}/canvas-groups/${encodeURIComponent(id)}`,
    payload
  );
}

export function deleteCanvasGroup(namespaceSlug: string, id: string) {
  return del<void>(
    `/api/v1/namespaces/${encodeURIComponent(namespaceSlug)}/canvas-groups/${encodeURIComponent(id)}`
  );
}
