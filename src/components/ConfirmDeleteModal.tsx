import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

export interface DeleteTargetConfig {
  title: string;
  entityLabel: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}

interface ConfirmDeleteModalProps {
  target: DeleteTargetConfig | null;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  target,
  onClose,
}: ConfirmDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setIsDeleting(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, isDeleting, onClose]);

  if (!target) return null;

  const handleConfirm = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await target.onConfirm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to delete this record.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div
        className="fixed inset-0 bg-slate-950/50"
        onClick={() => {
          if (!isDeleting) onClose();
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-md bg-red-50 border border-red-200 text-red-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2
              id="confirm-delete-title"
              className="font-display text-base font-semibold text-slate-900 truncate"
            >
              {target.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close delete confirmation"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {error}
            </div>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <p className="text-xs font-medium text-slate-500">Record to Delete</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {target.entityLabel}
            </p>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {target.description}
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDeleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-md transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? 'Deleting...' : target.confirmLabel ?? 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
