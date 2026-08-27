/**
 * Team Form Component
 */

import { useEffect, useRef, useState } from 'react';

import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  Cloud,
  Code,
  Cpu,
  Database,
  Globe,
  Lock,
  Monitor,
  Server,
  Settings,
  Shield,
  Upload,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { zodResolverV4 } from '@/lib/zod-resolver';
import type { Team } from '@/types/entities';

const teamFormSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(255, 'Team name is too long'),
  logo: z.string().optional(),
  description: z.string().optional(),
});

export type TeamFormValues = z.infer<typeof teamFormSchema>;

interface TeamFormProps {
  team?: Team;
  onSubmit: (data: TeamFormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const iconOptions = [
  { value: 'Users', label: 'Users', icon: Users },
  { value: 'Building2', label: 'Building', icon: Building2 },
  { value: 'Monitor', label: 'Monitor', icon: Monitor },
  { value: 'Server', label: 'Server', icon: Server },
  { value: 'Bot', label: 'Bot', icon: Bot },
  { value: 'Cpu', label: 'CPU', icon: Cpu },
  { value: 'Database', label: 'Database', icon: Database },
  { value: 'Globe', label: 'Globe', icon: Globe },
  { value: 'Zap', label: 'Zap', icon: Zap },
  { value: 'Code', label: 'Code', icon: Code },
  { value: 'Cloud', label: 'Cloud', icon: Cloud },
  { value: 'Shield', label: 'Security', icon: Shield },
  { value: 'Wrench', label: 'Operations', icon: Wrench },
  { value: 'Settings', label: 'Settings', icon: Settings },
  { value: 'Lock', label: 'Lock', icon: Lock },
  { value: 'Activity', label: 'Activity', icon: Activity },
  { value: 'AlertTriangle', label: 'Alert', icon: AlertTriangle },
];

export function TeamForm({ team, onSubmit, onCancel, isLoading = false }: TeamFormProps) {
  const { t } = useTranslation();
  const [logoType, setLogoType] = useState<'icon' | 'custom'>('icon');
  const [customLogoPreview, setCustomLogoPreview] = useState<string | null>(
    team?.logo &&
      (team.logo.startsWith('data:image/') ||
        team.logo.startsWith('http://') ||
        team.logo.startsWith('https://'))
      ? team.logo
      : null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine initial logo type
  const initialLogo = team?.logo || 'Users';
  const isCustomLogo =
    initialLogo &&
    (initialLogo.startsWith('data:image/') ||
      initialLogo.startsWith('http://') ||
      initialLogo.startsWith('https://'));

  const form = useForm<TeamFormValues>({
    resolver: zodResolverV4<TeamFormValues>(teamFormSchema),
    defaultValues: {
      name: team?.name || '',
      logo: isCustomLogo ? initialLogo : initialLogo || 'Users',
      description: team?.description || '',
    },
  });

  // Update logo type when team changes
  useEffect(() => {
    if (isCustomLogo) {
      setLogoType('custom');
      setCustomLogoPreview(initialLogo);
    } else {
      setLogoType('icon');
    }
  }, [team, isCustomLogo, initialLogo]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        form.setError('logo', { message: 'Please select an image file' });
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        form.setError('logo', { message: 'Image size must be less than 2MB' });
        return;
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCustomLogoPreview(base64String);
        form.setValue('logo', base64String);
        form.clearErrors('logo');
      };
      reader.onerror = () => {
        form.setError('logo', { message: 'Failed to read image file' });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveCustomLogo = () => {
    setCustomLogoPreview(null);
    form.setValue('logo', 'Users');
    setLogoType('icon');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.teams.form.nameLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('pages.teams.form.namePlaceholder')} {...field} />
              </FormControl>
              <FormDescription>{t('pages.teams.form.nameHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="logo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.teams.form.logoLabel')}</FormLabel>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={logoType === 'icon' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLogoType('icon');
                      if (!iconOptions.find((opt) => opt.value === field.value)) {
                        field.onChange('Users');
                      }
                    }}
                  >
                    {t('pages.teams.form.presetIcon')}
                  </Button>
                  <Button
                    type="button"
                    variant={logoType === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setLogoType('custom');
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('pages.teams.form.uploadImage')}
                  </Button>
                </div>

                {logoType === 'icon' ? (
                  <Select onValueChange={field.onChange} value={field.value || 'Users'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.teams.form.selectLogo')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {iconOptions.map((option) => {
                        const IconComponent = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {customLogoPreview ? (
                      <div className="relative inline-block">
                        <img
                          src={customLogoPreview}
                          alt="Team logo preview"
                          className="h-20 w-20 rounded-md object-cover border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={handleRemoveCustomLogo}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-20 w-20 border-2 border-dashed rounded-md">
                        <div className="text-center">
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {t('pages.teams.form.noImage')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <FormDescription>
                {t('pages.teams.form.logoHelp')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.teams.form.descriptionLabel')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t('pages.teams.form.descriptionPlaceholder')}
                  className="resize-none"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('pages.teams.form.descriptionHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading
              ? t('pages.teams.form.saving')
              : team
                ? t('pages.teams.form.update')
                : t('pages.teams.form.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
