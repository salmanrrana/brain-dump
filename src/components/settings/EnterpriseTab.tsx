import { ThemeSwitcher } from "../../components-v2/ui/ThemeSwitcher";

// =============================================================================
// TYPES
// =============================================================================

export interface EnterpriseTabProps {
  /** Whether this tab is currently visible */
  isActive: boolean;
  /** Whether conversation logging is enabled */
  conversationLoggingEnabled: boolean;
  /** Callback when logging enabled setting changes */
  onLoggingEnabledChange: (value: boolean) => void;
  /** Retention period in days (7-365) */
  conversationRetentionDays: number;
  /** Callback when retention period changes */
  onRetentionDaysChange: (value: number) => void;
}

// =============================================================================
// ENTERPRISE TAB COMPONENT
// =============================================================================

/**
 * EnterpriseTab - Settings tab for enterprise compliance features.
 *
 * Features:
 * - **Conversation logging toggle**: Enable/disable compliance audit logging
 * - **Retention period input**: Configure 7-365 day retention for logs
 * - **Theme picker**: ThemeSwitcher component with Ember/Mint/Solar options
 * - **Enterprise info box**: SOC2, GDPR, ISO 27001 compliance note
 *
 * Note: Theme is stored via the useTheme hook (localStorage-based).
 * Logging settings are persisted via the settings API.
 */
export function EnterpriseTab({
  isActive,
  conversationLoggingEnabled,
  onLoggingEnabledChange,
  conversationRetentionDays,
  onRetentionDaysChange,
}: EnterpriseTabProps) {
  return (
    <div
      id="tabpanel-enterprise"
      role="tabpanel"
      aria-labelledby="tab-enterprise"
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Theme Picker */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Color Theme</label>
          <ThemeSwitcher />
          <p className="mt-2 text-xs text-slate-500">Choose your preferred accent color theme</p>
        </div>

        {/* Enable Logging Toggle */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className="block text-sm font-medium text-slate-300">
              Enable Conversation Logging
            </label>
            <p className="text-xs text-slate-500">
              Record AI conversations for compliance auditing
            </p>
          </div>
          <button
            onClick={() => onLoggingEnabledChange(!conversationLoggingEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              conversationLoggingEnabled ? "bg-amber-600" : "bg-slate-700"
            }`}
            role="switch"
            aria-checked={conversationLoggingEnabled}
            aria-label="Enable Conversation Logging"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                conversationLoggingEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Retention Period */}
        <div>
          <label
            htmlFor="retention-days-input"
            className="block text-sm font-medium text-slate-400 mb-1"
          >
            Retention Period (days)
          </label>
          <input
            id="retention-days-input"
            type="number"
            min={7}
            max={365}
            value={conversationRetentionDays}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value)) {
                onRetentionDaysChange(Math.max(7, Math.min(365, value)));
              }
            }}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 "
            disabled={!conversationLoggingEnabled}
          />
          <p className="mt-1 text-xs text-slate-500">
            Conversation logs older than this will be archived (7-365 days)
          </p>
        </div>

        {/* Enterprise Info Box */}
        {conversationLoggingEnabled && (
          <div className="p-3 bg-slate-800/50 rounded-lg">
            <p className="text-xs text-slate-400">
              <span className="text-amber-400 font-medium">Enterprise feature:</span> Conversation
              logging creates an audit trail of all AI interactions for SOC2, GDPR, and ISO 27001
              compliance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default EnterpriseTab;
