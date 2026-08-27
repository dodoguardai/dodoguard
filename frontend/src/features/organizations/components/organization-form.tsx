/**
 * Organization Form Component
 */

import { useForm } from 'react-hook-form';
import { zodResolverV4 } from '@/lib/zod-resolver';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import type { Organization } from '@/types/entities';
import { useState, useRef, useEffect } from 'react';
import {
  Users,
  Building2,
  Monitor,
  Server,
  Bot,
  Cpu,
  Database,
  Globe,
  Zap,
  Code,
  Cloud,
  Shield,
  Wrench,
  Settings,
  Lock,
  Activity,
  AlertTriangle,
  Upload,
  X,
} from 'lucide-react';

const organizationFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Organization name is required')
    .max(255, 'Organization name is too long'),
  slug: z.string().min(1, 'Slug is required').max(255, 'Slug is too long').optional(),
  icon: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  planId: z.string().optional(),
});

export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

interface OrganizationFormProps {
  organization?: Organization;
  onSubmit: (data: OrganizationFormValues) => void;
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

export function OrganizationForm({
  organization,
  onSubmit,
  onCancel,
  isLoading = false,
}: OrganizationFormProps) {
  const { t } = useTranslation();
  const [iconType, setIconType] = useState<'icon' | 'custom'>('icon');
  const [customIconPreview, setCustomIconPreview] = useState<string | null>(
    organization?.icon &&
      (organization.icon.startsWith('data:image/') ||
        organization.icon.startsWith('http://') ||
        organization.icon.startsWith('https://'))
      ? organization.icon
      : null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine initial icon type
  const initialIcon = organization?.icon || 'Building2';
  const isCustomIcon =
    initialIcon &&
    (initialIcon.startsWith('data:image/') ||
      initialIcon.startsWith('http://') ||
      initialIcon.startsWith('https://'));

  const form = useForm<OrganizationFormValues>({
    resolver: zodResolverV4<OrganizationFormValues>(organizationFormSchema),
    defaultValues: {
      name: organization?.name || '',
      slug: organization?.slug || '',
      icon: isCustomIcon ? initialIcon : initialIcon || 'Building2',
      status: organization?.status || 'active',
      planId: organization?.planId || '',
    },
  });

  // Auto-generate slug from name if not provided
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'name' && value.name && !organization?.slug) {
        const slug = value.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        form.setValue('slug', slug);
      }
    });
    return () => subscription.unsubscribe();
  }, [form, organization]);

  // Update icon type when organization changes
  useEffect(() => {
    if (isCustomIcon) {
      setIconType('custom');
      setCustomIconPreview(initialIcon);
    } else {
      setIconType('icon');
    }
  }, [organization, isCustomIcon, initialIcon]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        form.setError('icon', { message: 'Please select an image file' });
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        form.setError('icon', { message: 'Image size must be less than 2MB' });
        return;
      }

      // Read file as base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCustomIconPreview(base64String);
        form.setValue('icon', base64String);
        form.clearErrors('icon');
      };
      reader.onerror = () => {
        form.setError('icon', { message: 'Failed to read image file' });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveCustomIcon = () => {
    setCustomIconPreview(null);
    form.setValue('icon', 'Building2');
    setIconType('icon');
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
              <FormLabel>{t('pages.organizations.form.nameLabel')}</FormLabel>
              <FormControl>
                <Input placeholder={t('pages.organizations.form.namePlaceholder')} {...field} />
              </FormControl>
              <FormDescription>{t('pages.organizations.form.nameHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.organizations.slug')}</FormLabel>
              <FormControl>
                <Input placeholder="organization-slug" {...field} />
              </FormControl>
              <FormDescription>
                {t('pages.organizations.form.slugHelp')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="icon"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.organizations.form.iconLabel')}</FormLabel>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={iconType === 'icon' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setIconType('icon');
                      if (!iconOptions.find((opt) => opt.value === field.value)) {
                        field.onChange('Building2');
                      }
                    }}
                  >
                    {t('pages.organizations.form.presetIcon')}
                  </Button>
                  <Button
                    type="button"
                    variant={iconType === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setIconType('custom');
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('pages.organizations.form.uploadImage')}
                  </Button>
                </div>

                {iconType === 'icon' ? (
                  <Select onValueChange={field.onChange} value={field.value || 'Building2'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('pages.organizations.form.selectIcon')} />
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
                    {customIconPreview ? (
                      <div className="relative inline-block">
                        <img
                          src={customIconPreview}
                          alt="Organization icon preview"
                          className="h-20 w-20 rounded-md object-cover border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                          onClick={handleRemoveCustomIcon}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-20 w-20 border-2 border-dashed rounded-md">
                        <div className="text-center">
                          <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            {t('pages.organizations.form.noImage')}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <FormDescription>
                {t('pages.organizations.form.iconHelp')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.organizations.form.statusLabel')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || 'active'}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('pages.organizations.form.selectStatus')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="active">{t('pages.organizations.form.statusActive')}</SelectItem>
                  <SelectItem value="inactive">{t('pages.organizations.form.statusInactive')}</SelectItem>
                  <SelectItem value="suspended">{t('pages.organizations.form.statusSuspended')}</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>{t('pages.organizations.form.statusHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="planId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('pages.organizations.planId')}</FormLabel>
              <FormControl>
                <Input placeholder={t('pages.organizations.form.planIdPlaceholder')} {...field} />
              </FormControl>
              <FormDescription>{t('pages.organizations.form.planIdHelp')}</FormDescription>
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
              ? t('pages.organizations.form.saving')
              : organization
                ? t('pages.organizations.form.update')
                : t('pages.organizations.add')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
