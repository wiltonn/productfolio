import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface SidebarState {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

interface AppState {
  sidebar: SidebarState;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        sidebar: {
          isCollapsed: false,
          toggleCollapsed: () =>
            set((state) => ({
              sidebar: { ...state.sidebar, isCollapsed: !state.sidebar.isCollapsed },
            })),
          setCollapsed: (collapsed) =>
            set((state) => ({
              sidebar: { ...state.sidebar, isCollapsed: collapsed },
            })),
        },
      }),
      {
        name: 'productfolio-app-storage',
        partialize: (state) => ({ sidebar: { isCollapsed: state.sidebar.isCollapsed } }),
      }
    ),
    { name: 'AppStore' }
  )
);
