import { get, post, put, del } from "./request";

export interface VariableDTO {
  id: string;
  environment_id: string;
  key: string;
  value: string;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListVariablesResponse {
  variables: VariableDTO[];
}

const base = (nsSlug: string, envSlug: string) =>
  `/api/v1/namespaces/${nsSlug}/environments/${envSlug}/variables`;

export function listVariables(nsSlug: string, envSlug: string) {
  return get<ListVariablesResponse>(base(nsSlug, envSlug));
}

export function createVariable(
  nsSlug: string,
  envSlug: string,
  data: { key: string; value: string; is_secret: boolean }
) {
  return post<VariableDTO>(base(nsSlug, envSlug), data);
}

export function updateVariable(
  nsSlug: string,
  envSlug: string,
  id: string,
  data: { key?: string; value?: string; is_secret?: boolean }
) {
  return put<VariableDTO>(`${base(nsSlug, envSlug)}/${id}`, data);
}

export function deleteVariable(nsSlug: string, envSlug: string, id: string) {
  return del<void>(`${base(nsSlug, envSlug)}/${id}`);
}
