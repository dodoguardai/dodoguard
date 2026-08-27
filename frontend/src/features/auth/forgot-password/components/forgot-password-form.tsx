import { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolverV4 } from '@/lib/zod-resolver';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';

const formSchema = z.object({
  email: z.email({
    error: (iss) => (iss.input === '' ? 'Please enter your email' : undefined),
  }),
});

function getForgotPasswordErrorMessage(error: any): string {
  const code = error?.response?.data?.error?.code;
  const message = error?.response?.data?.error?.message;

  if (code === 'USER_NOT_FOUND') {
    return 'No account found with this email address';
  }
  if (code === 'EMAIL_SEND_FAILED') {
    return 'Failed to send email. Please try again later.';
  }
  if (code === 'EMAIL_NOT_CONFIGURED') {
    return 'Email service is not configured. Unable to send reset email.';
  }

  return message || error?.message || 'Failed to send password reset email';
}

export function ForgotPasswordForm({ className, ...props }: React.HTMLAttributes<HTMLFormElement>) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | undefined>();
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolverV4<z.infer<typeof formSchema>>(formSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true);

    try {
      const response = await authApi.forgotPassword({ email: data.email });

      if (response.emailSent) {
        setSubmittedEmail(data.email);
        setEmailSent(true);
        setDevResetToken(undefined);
        toast.success('Email sent');
        return;
      }

      setSubmittedEmail(data.email);
      setEmailSent(false);
      setDevResetToken(response.resetToken);
      toast.success('Reset link generated');
    } catch (error: any) {
      const errorMessage = getForgotPasswordErrorMessage(error);
      toast.error(errorMessage);
      form.setError('email', { message: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }

  if (submittedEmail && emailSent) {
    return (
      <div className={cn('grid gap-4 text-center', className)}>
        <p className="text-sm font-medium text-foreground">Email sent</p>
        <p className="text-sm text-muted-foreground">
          Password reset instructions have been sent to{' '}
          <span className="font-medium text-foreground">{submittedEmail}</span>. Please check your
          inbox and spam folder.
        </p>
        <Button variant="outline" asChild>
          <Link to="/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  if (submittedEmail && devResetToken) {
    return (
      <div className={cn('grid gap-4 text-center', className)}>
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Email delivery is not configured. You can continue resetting your password in development.
        </p>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() =>
              navigate({
                to: '/reset-password',
                search: { token: devResetToken },
              })
            }
          >
            Continue to reset password
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
        className={cn('grid gap-2', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="name@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="mt-2" disabled={isLoading}>
          Continue
          {isLoading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        </Button>
      </form>
    </Form>
  );
}
