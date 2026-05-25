import { apiClient } from "./client";

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mod_time: string;
}

function fileBase(projectID: string, workloadID: string) {
  return `/api/v1/projects/${projectID}/workloads/${workloadID}/files`;
}

export function listFiles(projectID: string, workloadID: string, path = "/") {
  return apiClient
    .get<FileEntry[]>(fileBase(projectID, workloadID), { params: { path } })
    .then((r) => r.data);
}

export function downloadFile(projectID: string, workloadID: string, path: string) {
  return apiClient.get<Blob>(`${fileBase(projectID, workloadID)}/download`, {
    params: { path },
    responseType: "blob",
  });
}

export function deleteFile(projectID: string, workloadID: string, path: string) {
  return apiClient
    .delete(`${fileBase(projectID, workloadID)}`, { params: { path } })
    .then((r) => r.data);
}

export function renameFile(
  projectID: string,
  workloadID: string,
  from: string,
  to: string
) {
  return apiClient
    .post(`${fileBase(projectID, workloadID)}/rename`, { from, to })
    .then((r) => r.data);
}

export function createDirectory(projectID: string, workloadID: string, path: string) {
  return apiClient
    .post(`${fileBase(projectID, workloadID)}/mkdir`, null, { params: { path } })
    .then((r) => r.data);
}

export function uploadFiles(
  projectID: string,
  workloadID: string,
  destPath: string,
  files: File[],
  onProgress?: (pct: number) => void
) {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  return apiClient
    .post(`${fileBase(projectID, workloadID)}/upload`, form, {
      params: { path: destPath },
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    })
    .then((r) => r.data);
}

export function importZip(
  projectID: string,
  workloadID: string,
  destPath: string,
  file: File
) {
  const form = new FormData();
  form.append("file", file);
  return apiClient
    .post(`${fileBase(projectID, workloadID)}/import`, form, {
      params: { path: destPath },
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
}

export function exportZip(projectID: string, workloadID: string, path = "/") {
  return apiClient.get<Blob>(`${fileBase(projectID, workloadID)}/export`, {
    params: { path },
    responseType: "blob",
  });
}
