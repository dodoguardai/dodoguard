/**
 * Shared session Agent skill dropdown (bundled skills, excludes core-task-builder).
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AgentModeBundledSkill } from '@/services/api/agent-mode';

export type AgentModeSkillSelectProps = {
  bundled: AgentModeBundledSkill[];
  pinnedSkillSlug: string;
  onPinnedSkillSlugChange: (slug: string) => void;
  isZh: boolean;
  /** Extra classes for SelectTrigger */
  triggerClassName?: string;
  title?: string;
};

export function AgentModeSkillSelect({
  bundled,
  pinnedSkillSlug,
  onPinnedSkillSlugChange,
  isZh,
  triggerClassName,
  title,
}: AgentModeSkillSelectProps) {
  const defaultTitle = isZh
    ? '下拉单选 Agent 技能包；第一项表示由助手自动选用。'
    : 'Pick one Agent skill per send; first option lets the assistant choose.';

  return (
    <Select
      value={pinnedSkillSlug || '__auto__'}
      onValueChange={(v) => onPinnedSkillSlugChange(v === '__auto__' ? '' : v)}
    >
      <SelectTrigger
        className={triggerClassName}
        title={title ?? defaultTitle}
      >
        <SelectValue placeholder={isZh ? '助手自动选用' : 'Assistant auto'} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__auto__">
          {isZh ? '助手自动选用 Agent 技能' : 'Assistant picks Agent skill'}
        </SelectItem>
        {bundled
          .filter((b) => b.slug !== 'core-task-builder')
          .map((b) => (
            <SelectItem key={b.slug} value={b.slug}>
              {b.manifest.name} ({b.slug})
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
