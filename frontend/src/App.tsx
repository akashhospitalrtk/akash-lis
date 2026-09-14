import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, getToken } from './api';
import { LoginScreen, SetupScreen } from './components/AuthScreens';
import { InvestigationCatalogue } from './components/InvestigationCatalogue';
import { RegisterOrder } from './components/RegisterOrder';
import { RecordsExport } from './components/RecordsExport';
import { Report } from './components/Report';
import { ResultEntry } from './components/ResultEntry';
import { UserAdmin } from './components/UserAdmin';
import { Worklist } from './components/Worklist';
import { DoctorWorkspace } from './components/DoctorWorkspace';
import { useNavigation, type Page } from './hooks/useNavigation';
import { roleLabel } from './lib';
import type { Hospital, Order, Profile, User } from './types';

const defaultHospital = { name: 'Akash Diagnostic Center', address: '', phone: '' };

function NavIcon({ page }: { page: Page }) {
  const icon = {
    patients: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3M4 4h3M5.5 2.5v3" /></>,
    register: <><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.5-3.2 2.7-5 6.5-5s6 1.8 6.5 5M19 8v5M16.5 10.5h5" /></>,
    worklist: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
    entry: <><path d="M9 3h6M10 3v5l-5.2 8.3A3.2 3.2 0 0 0 7.5 21h9a3.2 3.2 0 0 0 2.7-4.7L14 8V3" /><path d="M8.5 16h7" /></>,
    report: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h4M9 13h6M9 17h6" /></>,
    exports: <><path d="M12 3v11M8 10l4 4 4-4M5 18v3h14v-3" /></>,
    catalogue: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 17h6M17 14v6" /></>,
    users: <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2.3" /><path d="M3.8 20c.4-3.1 2.3-5 5.2-5 3.1 0 5.1 1.9 5.5 5M15 15.5c2.7.2 4.4 1.7 4.8 4.5" /></>
  }[page];
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>;
}

export default function App() {
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hospital, setHospital] = useState<Hospital>(defaultHospital);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const { page, orderId, navigate } = useNavigation();
  const [orderLoading, setOrderLoading] = useState(false);
  const setPage = (next: Page) => navigate(next, (next === 'entry' || next === 'report') ? selectedOrder?.id : undefined);
  const [worklistVersion, setWorklistVersion] = useState(0);
  const [appError, setAppError] = useState('');

  useEffect(() => {
    const expired = () => { setUser(null); setSelectedOrder(null); setAppError(''); };
    window.addEventListener('lis-session-expired', expired);
    return () => window.removeEventListener('lis-session-expired', expired);
  }, []);

  useEffect(() => {
    void api<{ hospital: Hospital }>('/config').then((data) => setHospital(data.hospital)).catch(() => undefined);
    void api<{ initialized: boolean }>('/setup/status').then((data) => setInitialized(data.initialized)).catch((error: Error) => { setAppError(error.message); setInitialized(true); });
    if (getToken()) void api<{ user: User }>('/auth/me').then((data) => setUser(data.user)).catch(() => clearToken());
    else setUser(null);
  }, []);

  const loadProfiles = useCallback(() => {
    if (!user || ['DOCTOR', 'IT'].includes(user.role)) return Promise.resolve();
    return api<Profile[]>('/profiles').then(setProfiles).catch((error: Error) => setAppError(error.message));
  }, [user]);

  useEffect(() => { void loadProfiles(); }, [loadProfiles]);

  const onSession = useCallback((nextUser: User) => { setUser(nextUser); setInitialized(true); setSelectedOrder(null); navigate(nextUser.role === 'DOCTOR' ? 'patients' : nextUser.role === 'IT' ? 'users' : 'register', undefined, true); }, [navigate]);
  useEffect(() => {
    if (!user) return;
    if (user.role === 'IT' && page !== 'users') navigate('users', undefined, true);
    if (user.role === 'DOCTOR' && !['patients', 'report'].includes(page)) navigate('patients', undefined, true);
  }, [user?.role, page, navigate]);
  useEffect(() => {
    if (!user) return;
    const refreshSession = () => {
      void api<{ user: User }>('/auth/me').then((data) => setUser(data.user)).catch((error: { status?: number }) => {
        if (error.status === 401) { clearToken(); setUser(null); setSelectedOrder(null); }
      });
    };
    const timer = window.setInterval(refreshSession, 60000);
    window.addEventListener('focus', refreshSession);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshSession); };
  }, [user?.id]);
  const openOrder = useCallback((id: string, destination: Page = 'entry') => navigate(destination, id), [navigate]);
  useEffect(() => {
    if (!user || !orderId || !['entry', 'report'].includes(page)) return;
    if (user.role === 'IT' || (user.role === 'DOCTOR' && page !== 'report')) return;
    let active = true;
    setOrderLoading(true); setAppError('');
    void api<Order>(user.role === 'DOCTOR' ? `/clinical/orders/${orderId}/results` : `/orders/${orderId}`).then((order) => { if (active) setSelectedOrder(order); }).catch((error: Error) => {
      if (active) { setSelectedOrder(null); setAppError(error.message); }
    }).finally(() => { if (active) setOrderLoading(false); });
    return () => { active = false; };
  }, [orderId, page, user?.id, user?.role]);
  const updateOrder = useCallback((order: Order) => { setSelectedOrder(order); setWorklistVersion((version) => version + 1); }, []);

  function created(order: Order, enterValues = false) { updateOrder(order); navigate(enterValues ? 'entry' : 'worklist', enterValues ? order.id : undefined); }
  function logout() { clearToken(); setUser(null); setSelectedOrder(null); navigate('register', undefined, true); }

  if (initialized === null) return <main className="auth-shell"><p className="loading">Starting LIS…</p></main>;
  if (!initialized) return <SetupScreen onSuccess={onSession} />;
  if (!user) return <LoginScreen onSuccess={onSession} />;

  const nav: { id: Page; label: string; shortLabel: string; hidden?: boolean }[] = [
    { id: 'patients', label: 'Patients and report status', shortLabel: 'Patients', hidden: user.role === 'IT' },
    { id: 'register', label: 'Patient and order registration', shortLabel: 'New order', hidden: !['ADMIN', 'TECHNICIAN'].includes(user.role) },
    { id: 'worklist', label: 'Sample reception', shortLabel: 'Samples', hidden: ['DOCTOR', 'IT'].includes(user.role) },
    { id: 'entry', label: 'Result entry', shortLabel: 'Results', hidden: ['DOCTOR', 'IT'].includes(user.role) },
    { id: 'report', label: 'Laboratory reports', shortLabel: 'Reports', hidden: user.role === 'IT' },
    { id: 'exports', label: 'Records export', shortLabel: 'Records', hidden: user.role !== 'ADMIN' },
    { id: 'catalogue', label: 'Investigation catalogue', shortLabel: 'Tests', hidden: user.role !== 'ADMIN' },
    { id: 'users', label: 'Staff and departments', shortLabel: 'Team', hidden: !['ADMIN', 'IT'].includes(user.role) }
  ];

  return <div className="app-shell">
    <header className="app-header">
      <button className="brand" title={hospital.name} aria-label={`${hospital.name} home`} onClick={() => setPage('register')}><span aria-hidden="true">+</span><div><strong>AKASH</strong><small>Diagnostics</small></div></button>
      <nav>{nav.filter((item) => !item.hidden).map((item) => <button key={item.id} title={item.label} aria-label={item.label} className={page === item.id ? 'nav-active' : ''} onClick={() => setPage(item.id)}><NavIcon page={item.id} /><span>{item.shortLabel}</span></button>)}</nav>
      <div className="user-menu"><span>{user.fullName}<small>{roleLabel(user.role)}</small></span><button className="text-button" onClick={logout}>Sign out</button></div>
    </header>
    {appError && <div className="app-error">{appError}<button onClick={() => setAppError('')}>×</button></div>}
    <main>
      {(['exports', 'catalogue'].includes(page) && user.role !== 'ADMIN' || page === 'users' && !['ADMIN', 'IT'].includes(user.role)) && <section className="page empty-state"><h1>Administrator access required</h1><button onClick={() => setPage('patients')}>Go to patients</button></section>}
      {orderLoading && <p className="page loading">Loading selected order…</p>}
      {page === 'patients' && user.role !== 'IT' && <DoctorWorkspace key={orderId || 'patients'} user={user} orderId={orderId} onSelect={(id) => navigate('patients', id)} onReport={(id) => navigate('report', id)} />}
      {page === 'worklist' && !['DOCTOR', 'IT'].includes(user.role) && <Worklist onOpen={openOrder} reloadKey={worklistVersion} user={user} />}
      {page === 'register' && ['ADMIN', 'TECHNICIAN'].includes(user.role) && <RegisterOrder profiles={profiles} onCreated={created} />}
      {page === 'entry' && !['DOCTOR', 'IT'].includes(user.role) && !orderLoading && <ResultEntry key={orderId || 'no-order'} onDeleted={() => { setSelectedOrder(null); setWorklistVersion((v) => v + 1); setPage('worklist'); }} order={orderId && selectedOrder?.id === orderId ? selectedOrder : null} user={user} onUpdated={updateOrder} onReport={() => setPage('report')} />}
      {page === 'report' && user.role !== 'IT' && !orderLoading && <Report key={orderId || 'no-order'} order={orderId && selectedOrder?.id === orderId ? selectedOrder : null} hospital={hospital} user={user} onUpdated={updateOrder} onBack={() => user.role === 'DOCTOR' ? navigate('patients', orderId) : setPage('entry')} />}
      {page === 'exports' && user.role === 'ADMIN' && <RecordsExport />}
      {page === 'catalogue' && user.role === 'ADMIN' && <InvestigationCatalogue onChanged={() => void loadProfiles()} />}
      {page === 'users' && ['ADMIN', 'IT'].includes(user.role) && <UserAdmin currentUser={user} />}
    </main>
  </div>;
}
