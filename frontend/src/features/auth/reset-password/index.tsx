import { Link } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AuthLayout } from '../auth-layout';
import { ResetPasswordForm } from './components/reset-password-form';

type ResetPasswordProps = {
  token?: string;
};

export function ResetPassword({ token }: ResetPasswordProps) {
  return (
    <AuthLayout>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">Reset Password</CardTitle>
          <CardDescription>
            Enter your new password below to regain access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm token={token} />
        </CardContent>
        <CardFooter>
          <p className="mx-auto px-8 text-center text-sm text-muted-foreground">
            Remember your password?{' '}
            <Link to="/sign-in" className="underline underline-offset-4 hover:text-primary">
              Sign in
            </Link>
            .
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  );
}
