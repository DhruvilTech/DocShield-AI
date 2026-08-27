import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SceneVariant } from '../lib/scene';

interface SceneState {
  variant: SceneVariant;
  setVariant: (v: SceneVariant) => void;
  scanning: boolean;
  setScanning: (v: boolean) => void;
  clusterIndex: number;
  setClusterIndex: (i: number) => void;
  scrollY: number;
  setScrollY: (n: number) => void;
}

const SceneContext = createContext<SceneState | null>(null);

export const SceneProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [variant, setVariant] = useState<SceneVariant>('intelligence');
  const [scanning, setScanning] = useState(false);
  const [clusterIndex, setClusterIndex] = useState(-1);
  const [scrollY, setScrollY] = useState(0);

  const value = useMemo(
    () => ({
      variant,
      setVariant,
      scanning,
      setScanning,
      clusterIndex,
      setClusterIndex,
      scrollY,
      setScrollY,
    }),
    [variant, scanning, clusterIndex, scrollY]
  );

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
};

export function useScene() {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene must be used within SceneProvider');
  return ctx;
}

export function useOptionalScene() {
  return useContext(SceneContext);
}

export function useSetScanning() {
  const ctx = useContext(SceneContext);
  return useCallback(
    (v: boolean) => {
      ctx?.setScanning(v);
    },
    [ctx]
  );
}
