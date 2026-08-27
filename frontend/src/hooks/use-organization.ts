/**
 * useOrganization Hook
 * Provides organization management functionality
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganizationStore } from '@/stores/organization-store';
import { organizationsApi } from '@/services/api/organizations';
import type { Organization } from '@/types/entities';

interface UseOrganizationReturn {
  currentOrg: Organization | null;
  organizations: Organization[];
  isLoading: boolean;
  switchOrganization: (orgId: string) => void;
  refreshOrganizations: () => Promise<void>;
  createOrganizationMutation: ReturnType<
    typeof useMutation<Organization, Error, Partial<Organization>>
  >;
  updateOrganizationMutation: ReturnType<typeof useMutation<Organization, Error, Organization>>;
}

export function useOrganization(): UseOrganizationReturn {
  const { currentOrg, organizations, setCurrentOrg, setOrganizations } = useOrganizationStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    if (!data) return;
    setOrganizations(data);
    if (!currentOrg && data.length > 0) {
      setCurrentOrg(data[0]);
    }
  }, [data, currentOrg, setOrganizations, setCurrentOrg]);

  const createOrganizationMutation = useMutation({
    mutationFn: (data: Partial<Organization>) => organizationsApi.create(data),
    onSuccess: (newOrg) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setOrganizations([...organizations, newOrg]);
      // Optionally switch to the new organization
      setCurrentOrg(newOrg);
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: (org: Organization) => organizationsApi.update(org.id, org),
    onSuccess: (updatedOrg) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({
        queryKey: ['organizations', updatedOrg.id],
      });
      // Update in store
      const updatedOrgs = organizations.map((o) => (o.id === updatedOrg.id ? updatedOrg : o));
      setOrganizations(updatedOrgs);
      if (currentOrg?.id === updatedOrg.id) {
        setCurrentOrg(updatedOrg);
      }
    },
  });

  const switchOrganization = (orgId: string) => {
    const org = organizations.find((o) => o.id === orgId);
    if (org) {
      setCurrentOrg(org);
      // Invalidate all queries to refresh data for new organization
      queryClient.invalidateQueries();
    }
  };

  const refreshOrganizations = async () => {
    const data = await organizationsApi.list();
    setOrganizations(data);
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
  };

  return {
    currentOrg,
    organizations,
    isLoading,
    switchOrganization,
    refreshOrganizations,
    createOrganizationMutation,
    updateOrganizationMutation,
  };
}
