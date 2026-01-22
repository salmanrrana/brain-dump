import { Building2, FileText, Palette } from "lucide-react";
import { ThemeSwitcher } from "../../components-v2/ui/ThemeSwitcher";
import { sectionHeaderStyles, fieldStyles, inputStyles, toggleStyles } from "./settingsStyles";

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
 * EnterpriseTab - Settings tab for enterprise compliance features and appearance.
 *
 * Features:
 * - **Conversation logging toggle**: Enable/disable compliance audit logging
 * - **Retention period input**: Configure 7-365 day retention for logs
 * - **Enterprise info box**: SOC2, GDPR, ISO 27001 compliance note
 * - **Appearance/Theme**: Theme color selection (Ember, Mint, Solar)
 *
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
      hidden={!isActive}
      style={{ display: isActive ? "block" : "none" }}
    >
      <div className="space-y-6">
        {/* Conversation Logging Section */}
        <div>
          <div className={sectionHeaderStyles.container}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--status-warning)_15%,transparent)]">
              <FileText size={16} className="text-[var(--status-warning)]" />
            </div>
            <h3 className={sectionHeaderStyles.title}>Conversation Logging</h3>
          </div>

          {/* Enable Logging Toggle */}
          <div className={toggleStyles.row}>
            <div className={toggleStyles.info}>
              <div className={toggleStyles.label}>Enable Conversation Logging</div>
              <div className={toggleStyles.desc}>
                Record AI conversations for compliance auditing (SOC2, GDPR, ISO 27001)
              </div>
            </div>
            <button
              onClick={() => onLoggingEnabledChange(!conversationLoggingEnabled)}
              className={toggleStyles.switch(conversationLoggingEnabled)}
              role="switch"
              aria-checked={conversationLoggingEnabled}
              aria-label="Enable Conversation Logging"
            >
              <span className={toggleStyles.knob(conversationLoggingEnabled)} />
            </button>
          </div>

          {/* Retention Period */}
          <div className="mt-4">
            <label htmlFor="retention-days-input" className={fieldStyles.label}>
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
              className={inputStyles.base + " disabled:opacity-50 disabled:cursor-not-allowed"}
              disabled={!conversationLoggingEnabled}
            />
            <p className={fieldStyles.hint}>
              Conversation logs older than this will be archived (7-365 days)
            </p>
          </div>

          {/* Enterprise Info Box */}
          {conversationLoggingEnabled && (
            <div className="mt-4 p-3.5 bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)] border border-[color-mix(in_srgb,var(--status-warning)_30%,transparent)] rounded-xl">
              <div className="flex items-center gap-2.5">
                <Building2 size={14} className="text-[var(--status-warning)]" />
                <p className="text-xs text-[var(--status-warning)]">
                  <strong>Enterprise feature:</strong> Creates an audit trail of all AI interactions
                  for compliance requirements.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Appearance Section */}
        <div>
          <div className={sectionHeaderStyles.container}>
            <div className={sectionHeaderStyles.iconBox("var(--accent-ai)")}>
              <Palette size={16} className="text-[var(--accent-ai)]" />
            </div>
            <h3 className={sectionHeaderStyles.title}>Appearance</h3>
          </div>

          <div>
            <label className={fieldStyles.label}>Color Theme</label>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}

export default EnterpriseTab;
