"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  ChevronRight,
  Download,
  File as FileIcon,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  Archive,
  X,
} from "lucide-react";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kleffio/ui";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import {
  type FileEntry,
  listFiles,
  deleteFile,
  downloadFile,
  createDirectory,
  uploadFiles,
  importZip,
  exportZip,
  renameFile,
} from "@/lib/api/files";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <nav className="flex items-center gap-0.5 text-xs text-white/50 min-w-0">
      <button
        onClick={() => onNavigate("/")}
        className="hover:text-white/80 transition-colors shrink-0"
      >
        root
      </button>
      {parts.map((part, i) => {
        const to = "/" + parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        return (
          <React.Fragment key={to}>
            <ChevronRight className="size-3 shrink-0 text-white/20" />
            {isLast ? (
              <span className="text-white/80 truncate">{part}</span>
            ) : (
              <button
                onClick={() => onNavigate(to)}
                className="hover:text-white/80 transition-colors truncate"
              >
                {part}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function RenameModal({
  entry,
  currentPath,
  onClose,
  onDone,
  projectID,
  workloadID,
}: {
  entry: FileEntry;
  currentPath: string;
  onClose: () => void;
  onDone: () => void;
  projectID: string;
  workloadID: string;
}) {
  const [name, setName] = React.useState(entry.name);
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name === entry.name) { onClose(); return; }
    setSaving(true);
    try {
      const dir = currentPath === "/" ? "" : currentPath;
      const newPath = `${dir}/${name.trim()}`;
      await renameFile(projectID, workloadID, entry.path, newPath);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-80 rounded-xl border border-white/10 bg-[#111] p-5 shadow-2xl"
      >
        <p className="mb-3 text-sm font-medium text-white/90">Rename</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-white/20 focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-50"
          >
            {saving && <Loader2 className="size-3 animate-spin" />}
            Rename
          </button>
        </div>
      </form>
    </div>
  );
}

function MkdirModal({
  onClose,
  onDone,
  currentPath,
  projectID,
  workloadID,
}: {
  onClose: () => void;
  onDone: () => void;
  currentPath: string;
  projectID: string;
  workloadID: string;
}) {
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const dir = currentPath === "/" ? "" : currentPath;
      await createDirectory(projectID, workloadID, `${dir}/${name.trim()}`);
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-80 rounded-xl border border-white/10 bg-[#111] p-5 shadow-2xl"
      >
        <p className="mb-3 text-sm font-medium text-white/90">New Folder</p>
        <input
          autoFocus
          placeholder="folder-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 focus:border-white/20 focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-50"
          >
            {saving && <Loader2 className="size-3 animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </div>
  );
}

const TEXT_EXTENSIONS = new Set([
  "txt", "properties", "json", "toml", "yaml", "yml", "cfg", "conf",
  "ini", "sh", "bat", "md", "xml", "log", "env", "js", "ts", "py",
  "java", "kt", "go", "lua", "html", "css", "sql",
]);

function isTextFile(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return TEXT_EXTENSIONS.has(ext);
}

function EditorModal({
  entry,
  projectID,
  workloadID,
  onClose,
  onDone,
}: {
  entry: FileEntry;
  projectID: string;
  workloadID: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [content, setContent] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    downloadFile(projectID, workloadID, entry.path)
      .then((r) => r.data.text())
      .then(setContent)
      .catch((e) => setError(e?.data?.error ?? "Failed to load file"))
      .finally(() => setLoading(false));
  }, [projectID, workloadID, entry.path]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const dir = entry.path.split("/").slice(0, -1).join("/") || "/";
      const file = new File([content], entry.name, { type: "text/plain" });
      await uploadFiles(projectID, workloadID, dir, [file]);
      onDone();
    } catch (e: any) {
      console.error("[editor save]", e);
      const msg = e?.data?.error ?? e?.message ?? "Failed to save file";
      setError(e?.status ? `${e.status}: ${msg}` : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0d0d0d]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-2.5">
        <FileIcon className="size-3.5 shrink-0 text-white/30" />
        <span className="text-sm text-white/70 truncate flex-1">{entry.path}</span>
        <div className="flex items-center gap-1.5 ml-auto">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <X className="size-3.5" />
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            className="flex items-center gap-1.5 rounded-lg bg-primary/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="size-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-white/25">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none bg-transparent px-4 py-3 font-mono text-xs text-white/80 focus:outline-none leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}

export default function ServerFilesPage() {
  const { owner, slug, id } = useParams<{ owner: string; slug: string; id: string }>();
  const { projects } = useCurrentProject();
  const project = projects.find((p) => p.slug === slug);
  const projectID = project?.id ?? "";
  const workloadID = id;

  const [path, setPath] = React.useState("/");
  const [entries, setEntries] = React.useState<FileEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadPct, setUploadPct] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [mkdirOpen, setMkdirOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState<FileEntry | null>(null);
  const [editing, setEditing] = React.useState<FileEntry | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const zipInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(
    async (p = path) => {
      if (!projectID) return;
      setLoading(true);
      setError(null);
      try {
        const data = await listFiles(projectID, workloadID, p);
        setEntries(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e?.data?.error ?? "Failed to load files");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [projectID, workloadID, path]
  );

  React.useEffect(() => { load(); }, [load]);

  function navigate(p: string) {
    setPath(p);
    load(p);
  }

  async function handleDelete(entry: FileEntry) {
    if (!confirm(`Delete ${entry.name}?`)) return;
    await deleteFile(projectID, workloadID, entry.path);
    load();
  }

  async function handleDownload(entry: FileEntry) {
    const resp = await downloadFile(projectID, workloadID, entry.path);
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = entry.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    const resp = await exportZip(projectID, workloadID, path);
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "export.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadPct(0);
    try {
      await uploadFiles(projectID, workloadID, path, Array.from(files), setUploadPct);
      load();
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  async function handleImportZip(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      await importZip(projectID, workloadID, path, files[0]);
      load();
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleUpload(e.dataTransfer.files);
  }

  return (
    <div
      className="relative flex h-full flex-col bg-background text-foreground"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-primary/5">
          <p className="text-sm font-medium text-primary/80">Drop files to upload</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <Breadcrumb path={path} onNavigate={navigate} />
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => load()}
            title="Refresh"
            className="flex size-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            onClick={() => setMkdirOpen(true)}
            title="New folder"
            className="flex size-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <FolderPlus className="size-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload files"
            className="flex size-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <Upload className="size-3.5" />
          </button>
          <button
            onClick={handleExport}
            title="Export as .zip"
            className="flex size-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <Archive className="size-3.5" />
          </button>
          <button
            onClick={() => zipInputRef.current?.click()}
            title="Import .zip"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-colors"
          >
            Import .zip
          </button>
        </div>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="flex items-center gap-2 border-b border-white/[0.06] bg-primary/5 px-4 py-2">
          <Loader2 className="size-3.5 animate-spin text-primary/70" />
          <span className="text-xs text-primary/70">
            {uploadPct > 0 ? `Uploading… ${uploadPct}%` : "Processing…"}
          </span>
          {uploadPct > 0 && (
            <div className="ml-auto h-1 w-32 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary/70 transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading && entries.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-white/25">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-white/30">
            <FolderOpen className="size-8 opacity-40" />
            <p className="text-xs">{error}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-white/25">
            <FolderOpen className="size-8 opacity-40" />
            <p className="text-xs">Empty directory</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.05] text-white/30">
                <th className="px-4 py-2 text-left font-normal">Name</th>
                <th className="px-4 py-2 text-right font-normal">Size</th>
                <th className="px-4 py-2 text-right font-normal">Modified</th>
                <th className="w-10 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {/* Parent dir */}
              {path !== "/" && (
                <tr
                  className="cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors"
                  onClick={() => {
                    const parent = path.split("/").slice(0, -1).join("/") || "/";
                    navigate(parent);
                  }}
                >
                  <td className="flex items-center gap-2.5 px-4 py-2.5 text-white/40">
                    <Folder className="size-3.5 shrink-0 text-amber-400/60" />
                    ..
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/20" />
                  <td className="px-4 py-2.5 text-right text-white/20" />
                  <td className="px-4 py-2.5" />
                </tr>
              )}
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  className={cn(
                    "group border-b border-white/[0.04] transition-colors",
                    entry.is_dir && "cursor-pointer hover:bg-white/[0.03]",
                    !entry.is_dir && "hover:bg-white/[0.02]"
                  )}
                  onClick={() => {
                    if (entry.is_dir) navigate(entry.path);
                    else if (isTextFile(entry.name)) setEditing(entry);
                  }}
                >
                  <td className="flex items-center gap-2.5 px-4 py-2.5 text-white/75">
                    {entry.is_dir ? (
                      <Folder className="size-3.5 shrink-0 text-amber-400/70" />
                    ) : (
                      <FileIcon className="size-3.5 shrink-0 text-white/30" />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/35">
                    {entry.is_dir ? "—" : formatBytes(entry.size)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-white/35">
                    {formatDate(entry.mod_time)}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex size-6 items-center justify-center rounded text-white/25 opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] hover:text-white/60 transition-all">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {!entry.is_dir && isTextFile(entry.name) && (
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => setEditing(entry)}
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {!entry.is_dir && (
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => handleDownload(entry)}
                          >
                            <Download className="size-3.5" />
                            Download
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => setRenaming(entry)}
                        >
                          <FileIcon className="size-3.5" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-red-400 focus:text-red-400"
                          onClick={() => handleDelete(entry)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => handleImportZip(e.target.files)}
      />

      {/* Modals */}
      {mkdirOpen && (
        <MkdirModal
          projectID={projectID}
          workloadID={workloadID}
          currentPath={path}
          onClose={() => setMkdirOpen(false)}
          onDone={() => { setMkdirOpen(false); load(); }}
        />
      )}
      {renaming && (
        <RenameModal
          entry={renaming}
          currentPath={path}
          projectID={projectID}
          workloadID={workloadID}
          onClose={() => setRenaming(null)}
          onDone={() => { setRenaming(null); load(); }}
        />
      )}
      {editing && (
        <EditorModal
          entry={editing}
          projectID={projectID}
          workloadID={workloadID}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
