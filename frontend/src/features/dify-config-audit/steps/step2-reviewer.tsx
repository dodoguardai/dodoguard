/**
 * Step 2: Select reviewer model
 */

import { Link } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

export interface ModelOption {
  value: string;
  label: string;
  config?: { apiKey?: string; apiBaseUrl?: string };
}

export interface Step2ReviewerProps {
  modelOptions: ModelOption[];
  selectedModelValue: string;
  setSelectedModelValue: (v: string) => void;
  isLoading: boolean;
  integrationsError: boolean;
}

export function Step2Reviewer({
  modelOptions,
  selectedModelValue,
  setSelectedModelValue,
  isLoading,
  integrationsError,
}: Step2ReviewerProps) {
  return (
    <div className="space-y-4">
      {integrationsError && (
        <Alert variant="destructive">
          <AlertTitle>Could not load integrations</AlertTitle>
          <AlertDescription>
            You may need <code className="text-xs">system:read</code> permission, or the request
            failed. The audit will use the server default (
            <code className="text-xs">OPENAI_API_KEY</code> /{' '}
            <code className="text-xs">DIFY_CONFIG_AUDIT_PROVIDER_ID</code>) if you run without a
            selected model.
          </AlertDescription>
        </Alert>
      )}
      {!integrationsError && modelOptions.length === 0 && !isLoading && (
        <Alert>
          <AlertTitle>No LLM integration configured</AlertTitle>
          <AlertDescription>
            Add an enabled LLM integration in{' '}
            <Link
              to="/settings/models"
              className="text-primary font-medium underline-offset-4 hover:underline"
            >
              Settings → Integrations
            </Link>
            , or run the audit using the server default environment variables.
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Label htmlFor="dify-reviewer-model">Model</Label>
        {isLoading ? (
          <Skeleton className="mt-1 h-10 w-full" />
        ) : (
          <Select
            value={selectedModelValue || undefined}
            onValueChange={setSelectedModelValue}
            disabled={modelOptions.length === 0}
          >
            <SelectTrigger id="dify-reviewer-model" className="mt-1">
              <SelectValue
                placeholder={
                  modelOptions.length === 0 ? 'Server default (no integration)' : 'Select model'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Uses the same LLM integrations as{' '}
        <Link
          to="/settings/models"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Settings → Integrations
        </Link>
        . Credentials are sent to your backend over HTTPS; the server redacts secrets in logs.
      </p>
    </div>
  );
}
