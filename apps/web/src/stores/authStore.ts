import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BuAssignment {
  buId: string;
  buName: string;
  role: string;
  hasChatAccess: boolean;
}

interface AuthState {
  userId: string | null;
  globalRole: string | null;
  companyId: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  mustChangePassword: boolean;
  activeBuId: string | null;
  buAssignments: BuAssignment[];
  setAuth: (params: {
    userId: string;
    globalRole: string;
    mustChangePassword: boolean;
    companyName: string;
    firstName: string;
    lastName: string;
  }) => void;
  setBuAssignments: (assignments: BuAssignment[]) => void;
  setActiveBuId: (buId: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      globalRole: null,
      companyId: null,
      companyName: null,
      firstName: null,
      lastName: null,
      mustChangePassword: false,
      activeBuId: null,
      buAssignments: [],
      setAuth: ({ userId, globalRole, mustChangePassword, companyName, firstName, lastName }) =>
        set({ userId, globalRole, mustChangePassword, companyName, firstName, lastName }),
      setBuAssignments: (assignments) =>
        set({ buAssignments: assignments }),
      setActiveBuId: (buId) =>
        set({ activeBuId: buId }),
      clearAuth: () =>
        set({
          userId: null,
          globalRole: null,
          companyId: null,
          companyName: null,
          firstName: null,
          lastName: null,
          mustChangePassword: false,
          activeBuId: null,
          buAssignments: [],
        }),
    }),
    { name: 'auth-store' }
  )
);
