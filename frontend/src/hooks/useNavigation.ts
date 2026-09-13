import { useCallback, useEffect, useState } from 'react';

export type Page = 'worklist' | 'register' | 'entry' | 'report' | 'catalogue' | 'users' | 'exports';
type Location = { page: Page; orderId?: string };
const paths: Record<Page, string> = { register: '/register', worklist: '/samples', entry: '/results', report: '/reports', catalogue: '/tests', users: '/team', exports: '/records' };

function readLocation(): Location {
  const order = location.pathname.match(/^\/orders\/([a-zA-Z0-9-]+)\/(results|report)\/?$/);
  if (order) return { page: order[2] === 'results' ? 'entry' : 'report', orderId: order[1] };
  const page = (Object.keys(paths) as Page[]).find((key) => paths[key] === location.pathname);
  return { page: page || 'register' };
}

export function useNavigation() {
  const [route, setRoute] = useState<Location>(readLocation);
  useEffect(() => {
    const onPopState = () => setRoute(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = useCallback((page: Page, orderId?: string, replace = false) => {
    const path = orderId && (page === 'entry' || page === 'report') ? `/orders/${encodeURIComponent(orderId)}/${page === 'entry' ? 'results' : 'report'}` : paths[page];
    if (location.pathname !== path) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setRoute(readLocation());
  }, []);
  return { ...route, navigate };
}
