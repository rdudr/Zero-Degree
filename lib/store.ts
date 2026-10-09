import { create } from 'zustand';
import { persist, StateStorage, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';
import type { AirUnit, Chiller, CompanyProfile, CoolingTower, DataSet } from '@/lib/types';

export type { AirUnit, Chiller, CompanyProfile, CoolingTower, DataSet } from '@/lib/types';

// IndexedDB storage adapter for Zustand (a no-op while pages are prerendered on the server)
const hasIdb = () => typeof indexedDB !== 'undefined';
const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return hasIdb() ? (await get(name)) || null : null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (hasIdb()) await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    if (hasIdb()) await del(name);
  },
};

export type SyncJob = {
  jobId: string;
  status: 'pending' | 'synced';
  createdAt: number;
  reporterName: string;
  recipients?: string[];
  payload: DataSet;
};

type AppState = DataSet & {
  syncQueue: SyncJob[];
  hydrated: boolean;

  setProfile: (profile: CompanyProfile) => void;

  addAirUnit: (u: AirUnit) => void;
  updateAirUnit: (id: string, u: Partial<AirUnit>) => void;
  deleteAirUnit: (id: string) => void;

  addChiller: (c: Chiller) => void;
  updateChiller: (id: string, c: Partial<Chiller>) => void;
  deleteChiller: (id: string) => void;

  addCoolingTower: (t: CoolingTower) => void;
  updateCoolingTower: (id: string, t: Partial<CoolingTower>) => void;
  deleteCoolingTower: (id: string) => void;

  replaceData: (d: DataSet) => void;
  wipeData: () => void;

  addJobToQueue: (job: SyncJob) => void;
  updateJobStatus: (jobId: string, status: 'pending' | 'synced') => void;
  pruneQueue: () => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      profile: null,
      airUnits: [],
      chillers: [],
      coolingTowers: [],
      syncQueue: [],
      hydrated: false,

      setProfile: (profile) => set({ profile }),

      addAirUnit: (u) => set((s) => ({ airUnits: [...s.airUnits, u] })),
      updateAirUnit: (id, u) => set((s) => ({ airUnits: s.airUnits.map((x) => (x.id === id ? { ...x, ...u } : x)) })),
      deleteAirUnit: (id) => set((s) => ({ airUnits: s.airUnits.filter((x) => x.id !== id) })),

      addChiller: (c) => set((s) => ({ chillers: [...s.chillers, c] })),
      updateChiller: (id, c) => set((s) => ({ chillers: s.chillers.map((x) => (x.id === id ? { ...x, ...c } : x)) })),
      deleteChiller: (id) => set((s) => ({ chillers: s.chillers.filter((x) => x.id !== id) })),

      addCoolingTower: (t) => set((s) => ({ coolingTowers: [...s.coolingTowers, t] })),
      updateCoolingTower: (id, t) => set((s) => ({ coolingTowers: s.coolingTowers.map((x) => (x.id === id ? { ...x, ...t } : x)) })),
      deleteCoolingTower: (id) => set((s) => ({ coolingTowers: s.coolingTowers.filter((x) => x.id !== id) })),

      replaceData: (d) => set({ profile: d.profile, airUnits: d.airUnits, chillers: d.chillers, coolingTowers: d.coolingTowers }),
      wipeData: () => set({ profile: null, airUnits: [], chillers: [], coolingTowers: [], syncQueue: [] }),

      addJobToQueue: (job) => set((state) => {
        // Hard cap at 50 to prevent IndexedDB bloat
        const newQueue = [job, ...state.syncQueue.filter((j) => j.jobId !== job.jobId)];
        if (newQueue.length > 50) newQueue.length = 50;
        return { syncQueue: newQueue };
      }),

      updateJobStatus: (jobId, status) => set((state) => ({
        syncQueue: state.syncQueue.map(job => job.jobId === jobId ? { ...job, status } : job)
      })),

      pruneQueue: () => set((state) => {
        const now = Date.now();
        const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
        return {
          syncQueue: state.syncQueue.filter(job =>
            // Keep pending jobs OR synced jobs younger than 48 hours
            job.status === 'pending' || (now - job.createdAt < FORTY_EIGHT_HOURS)
          )
        };
      })
    }),
    {
      name: 'zero-degree-offline-storage',
      storage: createJSONStorage(() => idbStorage),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      partialize: ({ hydrated, ...rest }) => rest,
      onRehydrateStorage: () => () => { useAppStore.setState({ hydrated: true }); },
    }
  )
);

export function currentData(): DataSet {
  const s = useAppStore.getState();
  return { profile: s.profile, airUnits: s.airUnits, chillers: s.chillers, coolingTowers: s.coolingTowers };
}
