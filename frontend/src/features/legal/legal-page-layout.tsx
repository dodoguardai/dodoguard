import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/assets/logo';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type LegalPageLayoutProps = {
  title: string;
  description: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export function LegalPageLayout({
  title,
  description,
  lastUpdated,
  children,
}: LegalPageLayoutProps) {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex flex-col items-center gap-4">
        <Logo className="h-[72px] w-auto" />
        <Button variant="ghost" size="sm" className="w-fit" asChild>
          <Link to="/sign-in">
            <ArrowLeft className="me-1.5 size-4" />
            Back to sign in
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl tracking-tight">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-sm text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
