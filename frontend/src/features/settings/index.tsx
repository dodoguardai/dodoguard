/**
 * Settings Management Page
 */

import { useEffect, useState } from 'react';

import { useLocation } from '@tanstack/react-router';
import { Bell, Globe, Save, Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigDrawer } from '@/components/config-drawer';
import { Header } from '@/components/layout/header';
import { Main } from '@/components/layout/main';
import { ProfileDropdown } from '@/components/profile-dropdown';
import { Search } from '@/components/search';
import { ThemeSwitch } from '@/components/theme-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
export function Settings() {
  const location = useLocation();
  const settingsTabFromPath = location.pathname.split('/').pop();
  const validTabs = new Set(['general', 'security', 'notifications']);
  const tabFromPath =
    settingsTabFromPath && validTabs.has(settingsTabFromPath) ? settingsTabFromPath : 'general';
  const [activeTab, setActiveTab] = useState(tabFromPath);
  const { i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const tr = (en: string, zh: string) => (isZh ? zh : en);

  useEffect(() => {
    setActiveTab(tabFromPath);
  }, [tabFromPath]);

  // Mock settings data - in real implementation, these would come from API
  const [generalSettings, setGeneralSettings] = useState({
    systemName: 'DodoGuard Enterprise',
    timezone: 'UTC',
    language: 'en',
  });

  const [securitySettings, setSecuritySettings] = useState({
    passwordMinLength: 8,
    requireMFA: false,
    sessionTimeout: 3600,
  });

  const [featureFlags, setFeatureFlags] = useState({
    enableAgentDriven: true,
    enableCompositeAttack: true,
    enableKnowledgeBase: false,
    enableMultiTenant: true,
  });

  const handleSaveGeneral = () => {
    // In real implementation, this would call an API
    toast.success(tr('General settings saved', '通用设置已保存'));
  };

  const handleSaveSecurity = () => {
    toast.success(tr('Security settings saved', '安全设置已保存'));
  };

  const handleToggleFeature = (flag: string) => {
    setFeatureFlags((prev) => ({
      ...prev,
      [flag]: !prev[flag as keyof typeof prev],
    }));
    toast.success(
      tr(
        `Feature flag ${flag} ${featureFlags[flag as keyof typeof featureFlags] ? 'disabled' : 'enabled'}`,
        `功能开关 ${flag} ${featureFlags[flag as keyof typeof featureFlags] ? '已禁用' : '已启用'}`,
      ),
    );
  };

  return (
    <>
      <Header fixed>
        <Search />
        <div className="ms-auto flex items-center space-x-4">
          <ThemeSwitch />
          <ConfigDrawer />
          <ProfileDropdown />
        </div>
      </Header>

      <Main className="flex flex-1 flex-col gap-4 sm:gap-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{tr('Settings', '设置')}</h2>
            <p className="text-muted-foreground">
              {tr('Configure system settings and preferences.', '配置系统设置与偏好。')}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">
              <Globe className="mr-2 h-4 w-4" />
              {tr('General', '通用')}
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="mr-2 h-4 w-4" />
              {tr('Security', '安全')}
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="mr-2 h-4 w-4" />
              {tr('Notifications', '通知')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{tr('General Settings', '通用设置')}</CardTitle>
                <CardDescription>
                  {tr('Configure general system settings', '配置通用系统设置')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="systemName">{tr('System Name', '系统名称')}</Label>
                  <Input
                    id="systemName"
                    value={generalSettings.systemName}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({ ...prev, systemName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">{tr('Timezone', '时区')}</Label>
                  <Input
                    id="timezone"
                    value={generalSettings.timezone}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({ ...prev, timezone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">{tr('Language', '语言')}</Label>
                  <Input
                    id="language"
                    value={generalSettings.language}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({ ...prev, language: e.target.value }))
                    }
                  />
                </div>
                <Button onClick={handleSaveGeneral}>
                  <Save className="mr-2 h-4 w-4" />
                  {tr('Save Changes', '保存更改')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{tr('Feature Flags', '功能开关')}</CardTitle>
                <CardDescription>
                  {tr('Enable or disable system features', '启用或禁用系统功能')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Agent Driven Attacks', 'Agent 驱动攻击')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr(
                        'Enable AI agent-driven attack strategy generation',
                        '启用 AI Agent 驱动的攻击策略生成',
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={featureFlags.enableAgentDriven}
                    onCheckedChange={() => handleToggleFeature('enableAgentDriven')}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Composite Attacks', '组合攻击')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr('Enable multi-stage composite attack mode', '启用多阶段组合攻击模式')}
                    </p>
                  </div>
                  <Switch
                    checked={featureFlags.enableCompositeAttack}
                    onCheckedChange={() => handleToggleFeature('enableCompositeAttack')}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Knowledge Base Detection', '知识库检测')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr(
                        'Enable knowledge base-based vulnerability detection',
                        '启用基于知识库的漏洞检测',
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={featureFlags.enableKnowledgeBase}
                    onCheckedChange={() => handleToggleFeature('enableKnowledgeBase')}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Multi-Tenant', '多租户')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr('Enable multi-tenant organization support', '启用多租户组织支持')}
                    </p>
                  </div>
                  <Switch
                    checked={featureFlags.enableMultiTenant}
                    onCheckedChange={() => handleToggleFeature('enableMultiTenant')}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{tr('Security Settings', '安全设置')}</CardTitle>
                <CardDescription>
                  {tr('Configure security policies and settings', '配置安全策略与设置')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="passwordMinLength">
                    {tr('Minimum Password Length', '最小密码长度')}
                  </Label>
                  <Input
                    id="passwordMinLength"
                    type="number"
                    value={securitySettings.passwordMinLength}
                    onChange={(e) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        passwordMinLength: parseInt(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Require MFA', '要求 MFA')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr(
                        'Require multi-factor authentication for all users',
                        '要求所有用户使用多因素认证',
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={securitySettings.requireMFA}
                    onCheckedChange={(checked) =>
                      setSecuritySettings((prev) => ({ ...prev, requireMFA: checked }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">
                    {tr('Session Timeout (seconds)', '会话超时（秒）')}
                  </Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={securitySettings.sessionTimeout}
                    onChange={(e) =>
                      setSecuritySettings((prev) => ({
                        ...prev,
                        sessionTimeout: parseInt(e.target.value),
                      }))
                    }
                  />
                </div>
                <Button onClick={handleSaveSecurity}>
                  <Save className="mr-2 h-4 w-4" />
                  {tr('Save Changes', '保存更改')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{tr('Notification Settings', '通知设置')}</CardTitle>
                <CardDescription>
                  {tr('Configure notification preferences', '配置通知偏好')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Email Notifications', '邮件通知')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr('Send email notifications for important events', '重要事件通过邮件通知')}
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('Task Completion Notifications', '任务完成通知')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr('Notify when attack tasks complete', '攻击任务完成时通知')}
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{tr('High Risk Finding Alerts', '高风险发现告警')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {tr(
                        'Alert immediately when high-risk vulnerabilities are found',
                        '发现高风险漏洞时立即告警',
                      )}
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </Main>
    </>
  );
}
