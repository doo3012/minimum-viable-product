import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  userId: string | null;
  role: string | null;
  companyId: string | null;
  mustChangePassword: boolean;
  setAuth: (userId: string, role: string, mustChangePassword: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      role: null,
      companyId: null,
      mustChangePassword: false,
      setAuth: (userId, role, mustChangePassword) =>
        set({ userId, role, mustChangePassword }),
      clearAuth: () =>
        set({ userId: null, role: null, companyId: null, mustChangePassword: false }),
    }),
    { name: 'auth-store' }
  )
);
