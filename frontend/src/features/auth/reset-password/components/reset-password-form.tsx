import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { Link, useNavigate } from '@tanstack/react-router';
import { Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/services/api/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { PasswordInput } from '@/components/password-input';

const formSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Please enter your password')
      .min(7, 'Password must be at least 7 characters long'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ['confirmPassword'],
  });

type ResetPasswordFormProps = React.HTMLAttributes<HTMLFormElement> & {
  token?: string;
};

export function ResetPasswordForm({ className, token, ...props }: ResetPasswordFormProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | undefined>();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolverV4<z.infer<typeof formSchema>>(formSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        setTokenError('Reset link is invalid or missing.');
        setIsValidating(false);
        return;
      }

      try {
        const response = await authApi.validateResetToken(token);
        if (!cancelled) {
          setEmail(response.email);
          setTokenError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          const errorMessage =
            error?.response?.data?.error?.message ||
            error?.message ||
            'Reset link is invalid or has expired.';
          setTokenError(errorMessage);
        }
      } finally {
        if (!cancelled) {
          setIsValidating(false);
        }
      }
    }

    validateToken();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(data: z.infer<typeof formSchema>) {
    if (!token) {
      toast.error('Reset link is invalid or missing.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await authApi.resetPassword({
        token,
        password: data.password,
      });
      toast.success(response.message || 'Password reset successfully');
      navigate({ to: '/sign-in', replace: true });
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error?.message || error?.message || 'Failed to reset password';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  if (isValidating) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className={cn('grid gap-4 text-center', className)}>
        <p className="text-sm text-destructive">{tokenError}</p>
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/forgot-password">Request a new reset link</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/sign-in">Back to sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        {email && (
          <p className="text-sm text-muted-foreground">
            Resetting password for <span className="font-medium text-foreground">{email}</span>
          </p>
        )}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder="********" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder="********" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="mt-2" disabled={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" /> : <LogIn />}
          Reset password
        </Button>
      </form>
    </Form>
  );
}
