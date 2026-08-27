/**
 * Organization Store
 * Manages current organization and organization list
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Organization } from '@/types/entities';

interface OrganizationState {
  currentOrg: Organization | null;
  organizations: Organization[];
  setCurrentOrg: (org: Organization | null) => void;
  setOrganizations: (orgs: Organization[]) => void;
  addOrganization: (org: Organization) => void;
  updateOrganization: (org: Organization) => void;
  removeOrganization: (orgId: string) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  currentOrg: null,
  organizations: [],
};

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setCurrentOrg: (org) => {
        set({ currentOrg: org });
        // Dispatch custom event for organization change
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('organization-changed', { detail: org }));
        }
      },

      setOrganizations: (orgs) => {
        set({ organizations: orgs });
        // If no current org is set and we have orgs, set the first one
        if (!get().currentOrg && orgs.length > 0) {
          set({ currentOrg: orgs[0] });
        }
      },

      addOrganization: (org) => {
        set((state) => ({
          organizations: [...state.organizations, org],
        }));
      },

      updateOrganization: (org) => {
        set((state) => ({
          organizations: state.organizations.map((o) => (o.id === org.id ? org : o)),
          currentOrg: state.currentOrg?.id === org.id ? org : state.currentOrg,
        }));
      },

      removeOrganization: (orgId) => {
        set((state) => ({
          organizations: state.organizations.filter((o) => o.id !== orgId),
          currentOrg: state.currentOrg?.id === orgId ? null : state.currentOrg,
        }));
      },

      reset: () => {
        set(INITIAL_STATE);
      },
    }),
    {
      name: 'organization-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentOrg: state.currentOrg,
        organizations: state.organizations,
      }),
    },
  ),
);
