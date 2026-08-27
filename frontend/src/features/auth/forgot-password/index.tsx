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
import { ForgotPasswordForm } from './components/forgot-password-form';

export function ForgotPassword() {
  return (
    <AuthLayout>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">Forgot Password</CardTitle>
          <CardDescription>
            Enter your registered email. We will verify your account and send a password reset
            email if it exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter>
          <p className="mx-auto px-8 text-center text-sm text-balance text-muted-foreground">
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
