import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import useDialogState from '@/hooks/use-dialog-state';
import {
  getUserAvatarUrl,
  getUserDisplayName,
  getUserInitials,
} from '@/lib/user-display';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SHOW_HEADER_UTILITY_ACTIONS } from '@/components/layout/header-utility-actions';
import { SignOutDialog } from '@/components/sign-out-dialog';

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState();
  const { t } = useTranslation();
  const authUser = useAuthStore((state) => state.auth.user);
  const name = getUserDisplayName(authUser?.name, authUser?.email);
  const email = authUser?.email?.trim() || '';
  const avatar = getUserAvatarUrl(authUser?.avatar);
  const initials = getUserInitials(authUser?.name, authUser?.email);

  if (!SHOW_HEADER_UTILITY_ACTIONS) {
    return null;
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              {avatar ? <AvatarImage src={avatar} alt={name} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm leading-none font-medium">{name}</p>
              <p className="text-xs leading-none text-muted-foreground">{email || '—'}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to="/settings/account">
                {t('layout.profileMenu.profile')}
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings/general">
                {t('layout.profileMenu.settings')}
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
            {t('layout.profileMenu.signOut')}
            <DropdownMenuShortcut className="text-current">⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  );
}
