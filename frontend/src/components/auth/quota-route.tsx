/**
 * Quota Route Component
 * Route guard that checks quota before allowing access
 */

import { useState, useEffect } from 'react';
import { Navigate } from '@tanstack/react-router';
import { useQuota } from '@/hooks/use-quota';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface QuotaRouteProps {
  metric: string;
  children: React.ReactNode;
  redirectTo?: string;
}

export function QuotaRoute({ metric, children, redirectTo = '/settings/general' }: QuotaRouteProps) {
  const { checkQuota } = useQuota();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{
    remaining: number;
    limit: number;
    used: number;
  } | null>(null);

  useEffect(() => {
    const verifyQuota = async () => {
      try {
        const result = await checkQuota(metric);
        setAllowed(result.allowed);
        setQuotaInfo({
          remaining: result.remaining,
          limit: result.limit,
          used: result.used,
        });
        if (!result.allowed) {
          setShowModal(true);
        }
      } catch (error) {
        console.error('Quota check failed:', error);
        setAllowed(false);
        setShowModal(true);
      }
    };

    verifyQuota();
  }, [metric, checkQuota]);

  if (allowed === null) {
    return <div>Checking quota...</div>;
  }

  if (!allowed) {
    return (
      <>
        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quota Exceeded</DialogTitle>
              <DialogDescription>
                You have reached your quota limit for this operation.
              </DialogDescription>
            </DialogHeader>
            {quotaInfo && (
              <div className="py-4">
                <p className="text-sm text-muted-foreground">
                  Used: {quotaInfo.used} / {quotaInfo.limit}
                </p>
                <p className="text-sm text-muted-foreground">Remaining: {quotaInfo.remaining}</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Close
              </Button>
              <Button onClick={() => (window.location.href = redirectTo)}>View Subscription</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Navigate to={redirectTo} replace />
      </>
    );
  }

  return <>{children}</>;
}
