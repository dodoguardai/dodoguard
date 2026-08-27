import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from '@tanstack/react-router'
import { authApi } from '@/services/api/auth'
import { Loader2, LogIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useOrganizationStore } from '@/stores/organization-store'
import { cn } from '@/lib/utils'
import { zodResolverV4 } from '@/lib/zod-resolver'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'

const createFormSchema = (t: (key: string) => string) =>
  z.object({
    email: z.email({
      error: (iss) =>
        iss.input === '' ? t('auth.signIn.emailRequired') : undefined,
    }),
    password: z
      .string()
      .min(1, t('auth.signIn.passwordRequired'))
      .min(7, t('auth.signIn.passwordMin')),
  })

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()
  const { auth } = useAuthStore()
  const formSchema = createFormSchema(t)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolverV4<z.infer<typeof formSchema>>(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    try {
      const response = await authApi.login({
        email: data.email,
        password: data.password,
      })

      // Set tokens
      auth.setAccessToken(response.token)
      auth.setRefreshToken(response.refreshToken)

      // Set user (full User shape with defaults for optional fields)
      auth.setUser({
        id: response.user.id,
        email: response.user.email,
        name: response.user.name,
        role: response.user.role,
        avatar: response.user.avatar,
        organizationId: response.user.organizationId,
        status: 'active',
        emailVerified: false,
        mfaEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      // Set organization (full Organization shape with defaults)
      const { setCurrentOrg } = useOrganizationStore.getState()
      setCurrentOrg({
        id: response.user.organizationId,
        name: 'Default Organization',
        slug: 'default',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      toast.success(
        t('auth.signIn.welcomeBack', {
          name: response.user.name || response.user.email,
        })
      )

      // Redirect to the stored location or default to Quick Start
      let targetPath = redirectTo || '/'
      if (targetPath === '/_authenticated' || targetPath === '/_authenticated/')
        targetPath = '/'
      if (targetPath === '/') {
        navigate({ to: '/', search: { tab: 'quickstart' }, replace: true })
      } else {
        navigate({ to: targetPath, replace: true })
      }
    } catch (error: any) {
      console.error('Login error:', error)
      const errorMessage =
        error?.response?.data?.error?.message ||
        error?.message ||
        t('auth.signIn.failed')
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.signIn.email')}</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>{t('auth.signIn.password')}</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
              <Link
                to='/forgot-password'
                className='absolute end-0 -top-0.5 text-sm font-medium text-muted-foreground hover:opacity-75'
              >
                {t('auth.signIn.forgotPassword')}
              </Link>
            </FormItem>
          )}
        />
        <Button className='mt-2' disabled={isLoading}>
          {isLoading ? <Loader2 className='animate-spin' /> : <LogIn />}
          {t('auth.signIn.submit')}
        </Button>
      </form>
    </Form>
  )
}
