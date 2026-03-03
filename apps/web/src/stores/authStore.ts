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
  mustChangePassword: boolean;
  buAssignments: BuAssignment[];
  setAuth: (userId: string, globalRole: string, mustChangePassword: boolean) => void;
  setBuAssignments: (assignments: BuAssignment[]) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      globalRole: null,
      companyId: null,
      mustChangePassword: false,
      buAssignments: [],
      setAuth: (userId, globalRole, mustChangePassword) =>
        set({ userId, globalRole, mustChangePassword }),
      setBuAssignments: (assignments) =>
        set({ buAssignments: assignments }),
      clearAuth: () =>
        set({
          userId: null,
          globalRole: null,
          companyId: null,
          mustChangePassword: false,
          buAssignments: [],
        }),
    }),
    { name: 'auth-store' }
  )
);
