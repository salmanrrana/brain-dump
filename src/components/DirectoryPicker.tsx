import { useState, useEffect } from "react";
import { Folder, FolderOpen, ChevronUp, Plus, X, Loader2, Home } from "lucide-react";
import { listDirectory, createDirectory, getHomeDirectory } from "../api/filesystem";

interface DirectoryPickerProps {
  isOpen: boolean;
  initialPath: string | undefined;
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export default function DirectoryPicker({
  isOpen,
  initialPath,
  onSelect,
  onClose,
}: DirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New folder state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Load initial directory
  useEffect(() => {
    if (!isOpen) return;

    const loadInitial = async () => {
      setLoading(true);
      setError(null);
      try {
        const startPath = initialPath || (await getHomeDirectory({ data: undefined }));
        const result = await listDirectory({ data: startPath });
        setCurrentPath(result.path);
        setParentPath(result.parentPath);
        setEntries(result.entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load directory");
      } finally {
        setLoading(false);
      }
    };

    void loadInitial();
  }, [isOpen, initialPath]);

  const navigateTo = async (path: string) => {
    setLoading(true);
    setError(null);
    setIsCreatingFolder(false);
    try {
      const result = await listDirectory({ data: path });
      setCurrentPath(result.path);
      setParentPath(result.parentPath);
      setEntries(result.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory");
    } finally {
      setLoading(false);
    }
  };

  const goUp = () => {
    if (parentPath) {
      void navigateTo(parentPath);
    }
  };

  const goHome = async () => {
    try {
      const home = await getHomeDirectory({ data: undefined });
      void navigateTo(home);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get home directory");
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setCreateError(null);
    try {
      const newPath = await createDirectory({
        data: { parentPath: currentPath, name: newFolderName.trim() },
      });
      setNewFolderName("");
      setIsCreatingFolder(false);
      // Navigate to the new folder
      void navigateTo(newPath);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Select Directory</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Current Path */}
        <div className="px-4 py-2 bg-[var(--bg-tertiary)]/50 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-[var(--accent-ai)] flex-shrink-0" />
            <span className="text-sm text-[var(--text-primary)] truncate font-mono">
              {currentPath}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-primary)]">
          <button
            onClick={goUp}
            disabled={!parentPath || loading}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
            title="Go up"
          >
            <ChevronUp size={18} />
          </button>
          <button
            onClick={goHome}
            disabled={loading}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            title="Go to home"
          >
            <Home size={18} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setIsCreatingFolder(true)}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-primary)]"
          >
            <Plus size={14} />
            New Folder
          </button>
        </div>

        {/* New Folder Input */}
        {isCreatingFolder && (
          <div className="px-4 py-3 border-b border-[var(--border-primary)] bg-[var(--bg-tertiary)]/30">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateFolder();
                  if (e.key === "Escape") {
                    setIsCreatingFolder(false);
                    setNewFolderName("");
                    setCreateError(null);
                  }
                }}
                placeholder="Folder name..."
                autoFocus
                className="flex-1 px-3 py-1.5 bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded text-sm text-[var(--text-primary)]"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-3 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-hover)] rounded text-sm font-medium transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreatingFolder(false);
                  setNewFolderName("");
                  setCreateError(null);
                }}
                className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X size={16} />
              </button>
            </div>
            {createError && <p className="mt-2 text-xs text-[var(--error)]">{createError}</p>}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-[200px] max-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-[var(--accent-ai)]" size={24} />
            </div>
          ) : error ? (
            <div className="p-4 text-center">
              <p className="text-[var(--error)] text-sm">{error}</p>
              <button
                onClick={goHome}
                className="mt-3 text-sm text-[var(--accent-ai)] hover:underline"
              >
                Go to home directory
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] text-sm">
              No subdirectories
            </div>
          ) : (
            <div className="p-2">
              {entries.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => navigateTo(entry.path)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-left group"
                >
                  <Folder
                    size={18}
                    className="text-[var(--text-secondary)] group-hover:text-[var(--accent-ai)] transition-colors"
                  />
                  <span className="text-sm text-[var(--text-primary)] group-hover:text-[var(--text-primary)] truncate">
                    {entry.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-[var(--border-primary)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSelect}
            disabled={loading}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-hover)] rounded-lg font-medium transition-colors"
          >
            Select This Directory
          </button>
        </div>
      </div>
    </div>
  );
}
