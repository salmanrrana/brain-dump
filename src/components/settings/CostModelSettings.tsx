import { useState, useCallback, useId } from "react";
import { Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { useCostModels, useUpdateCostModel, useDeleteCostModel } from "../../lib/hooks";
import { useToast } from "../../lib/toast-context";
import type { CostModel } from "../../api/cost";
import { sectionHeaderStyles, inputStyles } from "./settingsStyles";

interface CostModelSettingsProps {
  isActive: boolean;
}

interface EditingModel {
  id?: string;
  provider: string;
  modelName: string;
  inputCostPerMtok: string;
  outputCostPerMtok: string;
  cacheReadCostPerMtok: string;
  cacheCreateCostPerMtok: string;
}

const EMPTY_FORM: EditingModel = {
  provider: "",
  modelName: "",
  inputCostPerMtok: "",
  outputCostPerMtok: "",
  cacheReadCostPerMtok: "",
  cacheCreateCostPerMtok: "",
};

function modelToForm(model: CostModel): EditingModel {
  return {
    id: model.id,
    provider: model.provider,
    modelName: model.modelName,
    inputCostPerMtok: String(model.inputCostPerMtok),
    outputCostPerMtok: String(model.outputCostPerMtok),
    cacheReadCostPerMtok:
      model.cacheReadCostPerMtok != null ? String(model.cacheReadCostPerMtok) : "",
    cacheCreateCostPerMtok:
      model.cacheCreateCostPerMtok != null ? String(model.cacheCreateCostPerMtok) : "",
  };
}

/**
 * CostModelSettings - Settings tab for managing AI pricing models.
 *
 * Displays a table of cost models grouped by provider with inline editing,
 * add, and delete capabilities. Uses toast notifications for feedback.
 */
export function CostModelSettings({ isActive }: CostModelSettingsProps) {
  const { data: models, isLoading, error } = useCostModels();
  const updateMutation = useUpdateCostModel();
  const deleteMutation = useDeleteCostModel();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<EditingModel>(EMPTY_FORM);

  const handleEdit = useCallback((model: CostModel) => {
    setEditingId(model.id);
    setForm(modelToForm(model));
    setIsAdding(false);
  }, []);

  const handleAdd = useCallback(() => {
    setIsAdding(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setIsAdding(false);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(() => {
    const input = parseFloat(form.inputCostPerMtok);
    const output = parseFloat(form.outputCostPerMtok);
    if (!form.provider || !form.modelName || isNaN(input) || isNaN(output)) {
      toast.error("Provider, model name, and costs are required");
      return;
    }
    const cacheRead = form.cacheReadCostPerMtok ? parseFloat(form.cacheReadCostPerMtok) : undefined;
    const cacheCreate = form.cacheCreateCostPerMtok
      ? parseFloat(form.cacheCreateCostPerMtok)
      : undefined;

    if (
      (cacheRead !== undefined && (isNaN(cacheRead) || cacheRead < 0)) ||
      (cacheCreate !== undefined && (isNaN(cacheCreate) || cacheCreate < 0))
    ) {
      toast.error("Cache cost values must be valid non-negative numbers");
      return;
    }

    updateMutation.mutate(
      {
        id: editingId ?? undefined,
        provider: form.provider,
        modelName: form.modelName,
        inputCostPerMtok: input,
        outputCostPerMtok: output,
        cacheReadCostPerMtok: cacheRead,
        cacheCreateCostPerMtok: cacheCreate,
      },
      {
        onSuccess: () => {
          toast.success(editingId ? "Cost model updated" : "Cost model added");
          handleCancel();
        },
        onError: (err) => {
          toast.error(`Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`);
        },
      }
    );
  }, [form, editingId, updateMutation, toast, handleCancel]);

  const handleDelete = useCallback(
    (model: CostModel) => {
      deleteMutation.mutate(model.id, {
        onSuccess: () => {
          toast.success(`Deleted ${model.provider}/${model.modelName}`);
          if (editingId === model.id) handleCancel();
        },
        onError: (err) => {
          toast.error(`Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`);
        },
      });
    },
    [deleteMutation, toast, editingId, handleCancel]
  );

  const handleFieldChange = useCallback((field: keyof EditingModel, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") handleCancel();
    },
    [handleSave, handleCancel]
  );

  // Group models by provider
  const grouped = (models ?? []).reduce<Record<string, CostModel[]>>((acc, model) => {
    const key = model.provider;
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {});

  return (
    <div
      role="tabpanel"
      id="tabpanel-pricing"
      aria-labelledby="tab-pricing"
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className={sectionHeaderStyles.container}>
        <div className={sectionHeaderStyles.iconBox("var(--accent-primary)")}>
          <span style={{ color: "var(--accent-primary)", fontSize: 14 }}>$</span>
        </div>
        <span className={sectionHeaderStyles.title}>AI Pricing Models</span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-[var(--text-secondary)] text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading cost models...
        </div>
      )}

      {error && (
        <div className="py-4 text-sm text-[var(--accent-danger)]">
          Failed to load cost models: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {!isLoading && !error && (
        <>
          {/* Model table */}
          <div className="space-y-4">
            {Object.entries(grouped).map(([provider, providerModels]) => (
              <div key={provider}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 capitalize">
                  {provider}
                </h4>
                <div className="space-y-1">
                  {providerModels.map((model) =>
                    editingId === model.id ? (
                      <ModelEditRow
                        key={model.id}
                        form={form}
                        isSaving={updateMutation.isPending}
                        onFieldChange={handleFieldChange}
                        onSave={handleSave}
                        onCancel={handleCancel}
                        onKeyDown={handleKeyDown}
                      />
                    ) : (
                      <ModelRow
                        key={model.id}
                        model={model}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        isDeleting={
                          deleteMutation.isPending && deleteMutation.variables === model.id
                        }
                      />
                    )
                  )}
                </div>
              </div>
            ))}

            {(models ?? []).length === 0 && (
              <div className="py-6 text-center text-sm text-[var(--text-tertiary)]">
                No cost models configured. Run database migration to seed defaults.
              </div>
            )}
          </div>

          {/* Add form */}
          {isAdding && (
            <div className="mt-4 p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-primary)]">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                Add New Model
              </h4>
              <ModelEditRow
                form={form}
                isSaving={updateMutation.isPending}
                onFieldChange={handleFieldChange}
                onSave={handleSave}
                onCancel={handleCancel}
                onKeyDown={handleKeyDown}
                showProviderField
              />
            </div>
          )}

          {/* Add button */}
          {!isAdding && (
            <button
              onClick={handleAdd}
              className="mt-4 flex items-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Model
            </button>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ModelRow({
  model,
  onEdit,
  onDelete,
  isDeleting,
}: {
  model: CostModel;
  onEdit: (model: CostModel) => void;
  onDelete: (model: CostModel) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] group transition-colors">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-[var(--text-primary)]">{model.modelName}</span>
        <div className="flex gap-3 mt-0.5 text-xs text-[var(--text-tertiary)]">
          <span>In: ${model.inputCostPerMtok}/1M</span>
          <span>Out: ${model.outputCostPerMtok}/1M</span>
          {model.cacheReadCostPerMtok != null && (
            <span>Cache: ${model.cacheReadCostPerMtok}/1M</span>
          )}
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(model)}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label={`Edit ${model.modelName}`}
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onDelete(model)}
          disabled={isDeleting}
          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent-danger)] transition-colors disabled:opacity-50"
          aria-label={`Delete ${model.modelName}`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function ModelEditRow({
  form,
  isSaving,
  onFieldChange,
  onSave,
  onCancel,
  onKeyDown,
  showProviderField,
}: {
  form: EditingModel;
  isSaving: boolean;
  onFieldChange: (field: keyof EditingModel, value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  showProviderField?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      {showProviderField ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            id={`${id}-provider`}
            className={inputStyles.base}
            placeholder="Provider (e.g. anthropic)"
            value={form.provider}
            onChange={(e) => onFieldChange("provider", e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Provider"
          />
          <input
            id={`${id}-model`}
            className={inputStyles.base}
            placeholder="Model name"
            value={form.modelName}
            onChange={(e) => onFieldChange("modelName", e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Model name"
          />
        </div>
      ) : (
        <div className="text-sm font-medium text-[var(--text-primary)] mb-1">{form.modelName}</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-input-cost`} className="text-xs text-[var(--text-tertiary)]">
            Input $/1M tok
          </label>
          <input
            id={`${id}-input-cost`}
            className={inputStyles.base}
            type="number"
            step="0.01"
            min="0"
            placeholder="15.00"
            value={form.inputCostPerMtok}
            onChange={(e) => onFieldChange("inputCostPerMtok", e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div>
          <label htmlFor={`${id}-output-cost`} className="text-xs text-[var(--text-tertiary)]">
            Output $/1M tok
          </label>
          <input
            id={`${id}-output-cost`}
            className={inputStyles.base}
            type="number"
            step="0.01"
            min="0"
            placeholder="75.00"
            value={form.outputCostPerMtok}
            onChange={(e) => onFieldChange("outputCostPerMtok", e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-cache-read`} className="text-xs text-[var(--text-tertiary)]">
            Cache Read $/1M (optional)
          </label>
          <input
            id={`${id}-cache-read`}
            className={inputStyles.base}
            type="number"
            step="0.01"
            min="0"
            placeholder="1.50"
            value={form.cacheReadCostPerMtok}
            onChange={(e) => onFieldChange("cacheReadCostPerMtok", e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <div>
          <label htmlFor={`${id}-cache-create`} className="text-xs text-[var(--text-tertiary)]">
            Cache Create $/1M (optional)
          </label>
          <input
            id={`${id}-cache-create`}
            className={inputStyles.base}
            type="number"
            step="0.01"
            min="0"
            placeholder="18.75"
            value={form.cacheCreateCostPerMtok}
            onChange={(e) => onFieldChange("cacheCreateCostPerMtok", e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium text-white transition-all disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, var(--accent-primary), var(--accent-ai))",
            boxShadow: "0 2px 8px var(--accent-glow)",
          }}
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
