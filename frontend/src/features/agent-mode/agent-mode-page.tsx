/**
 * Agent mode — conversational attack task builder (Integration LLM + bundled skills).
 */

import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { ThemeSwitch } from '@/components/theme-switch';
import { agentModeApi } from '@/services/api/agent-mode';
import { AgentModeAside } from './agent-mode-aside';
import { AgentModeChat } from './agent-mode-chat';
import {
  AgentModeLayout,
  AGENT_MODE_SURFACES,
  type AgentModeSurface,
} from './agent-mode-layout';

type AgentModePageProps = {
  surface: AgentModeSurface;
};

export function AgentModePage({ surface: surfaceSearch }: AgentModePageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isZh = i18n.language.startsWith('zh');

  const [pinnedSkillSlug, setPinnedSkillSlug] = useState('');
  const { data: bundledSkills = [] } = useQuery({
    queryKey: ['agent-mode-bundled-skills'],
    queryFn: () => agentModeApi.listBundledSkills(),
  });

  const surface: AgentModeSurface = AGENT_MODE_SURFACES.includes(surfaceSearch)
    ? surfaceSearch
    : 'dify';

  const setSurface = (next: AgentModeSurface) => {
    navigate({
      to: '/tasks/agent-mode',
      search: { surface: next },
      replace: true,
    });
  };

  const title = t('sidebar.item.agentMode', { defaultValue: isZh ? '智能体模式' : 'Agent mode' });

  const description = isZh ? (
    <>
      用对话描述意图即可：<strong className="text-foreground">待测智能体</strong>与
      <strong className="text-foreground">本会话 Agent 技能</strong>
      均为下拉单选（Agent 技能列表可很长）；选「助手自动选用」则不固定技能。
      <strong className="text-foreground">草案、校验、确认与测试报告</strong>均在
      <strong className="text-foreground">对话里</strong>
      完成（报告详情见任务运行）。
      <span className="text-foreground ring-border mx-0.5 rounded-md bg-card/80 px-1.5 py-0.5 font-mono text-[11px] ring-1">
        Integration LLM
      </span>
      风格编排：模型 → 工具上下文 → 校验 → 对话内确认。模型与 system 在{' '}
      <strong className="text-foreground">设置 → 集成 → 智能体模式</strong> 配置。
    </>
  ) : (
    <>
      Describe intent in chat: <strong className="text-foreground">target agent</strong> and{' '}
      <strong className="text-foreground">session Agent skill</strong> are single-select dropdowns (scroll when long);{' '}
      <strong className="text-foreground">assistant auto</strong> leaves no pinned Agent skill.
      <strong className="text-foreground"> Draft, validation, confirmation, and reports </strong>
      stay <strong className="text-foreground">in this thread</strong> (open the task run for full reports).
      <span className="text-foreground ring-border mx-0.5 rounded-md bg-card/80 px-1.5 py-0.5 font-mono text-[11px] ring-1">
        Integration LLM
      </span>{' '}
      flow: model → context → validate → confirm here. Configure under{' '}
      <strong className="text-foreground">Settings → Integrations → Agent mode</strong>.
    </>
  );

  return (
    <>
      <Header fixed>
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main fluid className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <AgentModeLayout
          surface={surface}
          onSurfaceChange={setSurface}
          title={title}
          description={description}
          tasksLinkLabel={isZh ? '智能体安全测试' : 'Security testing'}
          isZh={isZh}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <div className="mx-auto grid w-full max-w-[min(100%,1680px)] gap-5 lg:grid-cols-[minmax(260px,360px)_1fr] lg:gap-6 xl:gap-8">
            <AgentModeAside isZh={isZh} />
            <AgentModeChat
              surface={surface}
              isZh={isZh}
              bundled={bundledSkills}
              pinnedSkillSlug={pinnedSkillSlug}
              onPinnedSkillSlugChange={setPinnedSkillSlug}
            />
          </div>
        </div>
      </Main>
    </>
  );
}
