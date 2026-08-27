import { useTranslation } from 'react-i18next'
import { Logo } from '@/assets/logo'
import { LanguageSwitcher } from '@/components/layout/language-switcher'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { i18n } = useTranslation()
  const isZh = i18n.language.startsWith('zh')

  return (
    <div className='relative container grid h-svh max-w-none items-center justify-center'>
      <div className='absolute end-4 top-4'>
        <LanguageSwitcher />
      </div>
      <div className='mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:w-[480px] sm:p-8'>
        <div className='mb-4 flex items-center justify-center'>
          {isZh ? (
            <div className='flex items-center gap-3'>
              <div className='h-[90px] w-[105px] overflow-hidden'>
                <Logo className='h-[90px] w-auto max-w-none' />
              </div>
              <span className='text-4xl font-bold tracking-normal text-primary'>
                智安
              </span>
            </div>
          ) : (
            <Logo className='h-[90px] w-auto' />
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
