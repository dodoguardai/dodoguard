import {
  CAPABILITY_AUDIT_DIMENSION_IDS,
  dimensionLabel,
  type CapabilityAuditDimensionId,
} from 'capability-audit/shared/dimensions';

type DimensionChipsProps = {
  isZh: boolean;
  activeId?: CapabilityAuditDimensionId | null;
  onSelect?: (id: CapabilityAuditDimensionId) => void;
};

const CHIP_COLORS: Record<CapabilityAuditDimensionId, string> = {
  command_injection: 'bg-red-500/10 text-red-800 border-red-500/25 dark:text-red-200',
  prompt_injection: 'bg-violet-500/10 text-violet-800 border-violet-500/25 dark:text-violet-200',
  data_exfiltration: 'bg-orange-500/10 text-orange-800 border-orange-500/25 dark:text-orange-200',
  hardcoded_secrets: 'bg-amber-500/10 text-amber-900 border-amber-500/25 dark:text-amber-200',
  unauthorized_tool_call: 'bg-rose-500/10 text-rose-800 border-rose-500/25 dark:text-rose-200',
  code_obfuscation: 'bg-slate-500/10 text-slate-800 border-slate-500/25 dark:text-slate-200',
  social_engineering: 'bg-pink-500/10 text-pink-800 border-pink-500/25 dark:text-pink-200',
  resource_abuse: 'bg-cyan-500/10 text-cyan-900 border-cyan-500/25 dark:text-cyan-200',
  supply_chain_attack: 'bg-indigo-500/10 text-indigo-800 border-indigo-500/25 dark:text-indigo-200',
  privilege_escalation: 'bg-purple-500/10 text-purple-800 border-purple-500/25 dark:text-purple-200',
  malicious_guidance: 'bg-red-600/10 text-red-900 border-red-600/25 dark:text-red-200',
  skill_md_inconsistency: 'bg-blue-500/10 text-blue-800 border-blue-500/25 dark:text-blue-200',
  code_quality: 'bg-neutral-500/10 text-neutral-800 border-neutral-500/25 dark:text-neutral-200',
  bytecode_tampering: 'bg-stone-500/10 text-stone-800 border-stone-500/25 dark:text-stone-200',
  trigger_hijacking: 'bg-fuchsia-500/10 text-fuchsia-800 border-fuchsia-500/25 dark:text-fuchsia-200',
  unicode_steganography: 'bg-teal-500/10 text-teal-900 border-teal-500/25 dark:text-teal-200',
  transitive_trust_abuse: 'bg-sky-500/10 text-sky-900 border-sky-500/25 dark:text-sky-200',
};

export function DimensionChips({ isZh, activeId, onSelect }: DimensionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CAPABILITY_AUDIT_DIMENSION_IDS.map((id) => {
        const selected = activeId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect?.(id)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity ${CHIP_COLORS[id]} ${
              onSelect ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
            } ${selected ? 'ring-2 ring-neutral-950 ring-offset-1 dark:ring-neutral-100' : ''}`}
          >
            {dimensionLabel(id, isZh)}
          </button>
        );
      })}
    </div>
  );
}
