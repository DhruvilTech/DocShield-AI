export type SceneVariant =
  | 'intelligence'
  | 'scanner'
  | 'analysis'
  | 'security'
  | 'enterprise'
  | 'threats'
  | 'vault'
  | 'reports';

export function variantFromPath(pathname: string): SceneVariant {
  if (pathname === '/scanner') return 'scanner';
  if (pathname === '/intelligence') return 'intelligence';
  if (pathname === '/analysis') return 'analysis';
  if (pathname === '/security') return 'security';
  if (pathname === '/enterprise') return 'enterprise';
  if (pathname === '/threats') return 'threats';
  if (pathname === '/vault') return 'vault';
  if (pathname === '/reports') return 'reports';
  return 'intelligence';
}
