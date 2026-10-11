/**
 * AUDITORIAPLUS+ - PWA de Auditoría de Inventario Físico
 * Layout Principal PWA: Barra Superior de Control, Bottom Navigation Dock y Flujo CQRS.
 * Cero datos mock. Modo offline transparente con IndexedDB (AuditDB) y sincronización automática.
 * FASE 1.5: Login Modo Quiosco + Control de Roles Estricto + Misión Global Persistente.
 */

import React, { useEffect, useState, useTransition, useRef } from 'react';
import {
  UploadCloud,
  Barcode,
  AlertTriangle,
  FileText,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  LogOut,
  User,
  Fingerprint,
  ShieldCheck,
  ArrowRight,
  Database // INYECTADO PARA EL NUEVO BOTÓN
} from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured, checkSupabaseConnection } from './lib/supabase';
import { useMissionStore } from './store/useMissionStore';
import { useDiscrepancyStore } from './stores/useDiscrepancyStore';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { PWAInstallButton } from './components/PWAInstallButton';
import { TabIngestion } from './components/TabIngestion';
import { TabCollector } from './components/TabCollector';
import { TabFloorReconciliation } from './components/TabFloorReconciliation';
import { TabReports } from './components/TabReports';
import { getOfflineQueueCount } from './lib/db';
import { processOfflineQueue, subscribeToSync } from './lib/sync';
import { useAuthStore } from './stores/useAuthStore';

type ActiveTab = 'ingestion' | 'mission' | 'discrepancies' | 'reports';

const KIOSK_USERS = [
  { name: 'David', email: 'david@maraplus.local', pass: '123456', icon: ShieldCheck, color: 'text-[#263988]', bg: 'bg-[#263988]/10' },
  { name: 'Franyelin', email: 'franyelin@maraplus.local', pass: '123456', icon: User, color: 'text-[#009045]', bg: 'bg-[#009045]/10' },
  { name: 'Luis', email: 'luis@maraplus.local', pass: '123456', icon: User, color: 'text-[#F59E0B]', bg: 'bg-[#F59E0B]/10' }
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'auditor' | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const { setAuth } = useAuthStore();
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<ActiveTab>('mission');
  const [, startTransition] = useTransition();

  // Stores con las nuevas variables de FASE 2 inyectadas
  const {
    activeMissionId,
    activeMission,
    metrics,
    tasks,
    fetchMissionTasks,
    setActiveMissionId,
    setActiveMission,
    isEnriching,          // NUEVO
    enrichProgress,       // NUEVO
    runMissionEnrichment  // NUEVO
  } = useMissionStore();

  const {
    pendingFloorDiscrepancies,
    setPendingDiscrepancies,
  } = useDiscrepancyStore();

  const [dbStatus, setDbStatus] = useState<{ connected: boolean; latencyMs: number; error?: string }>({
    connected: false,
    latencyMs: 0,
  });
  const [queuedEvents, setQueuedEvents] = useState<number>(0);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error';
  } | null>(null);

  const lastBroadcastedMissionRef = useRef<string | null>(null);

  const changeTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    localStorage.setItem('auditoria_active_tab', tab); 
  };

  const fetchUserRole = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('Read_Users_Gamification')
        .select('Role')
        .eq('UserId', userId)
        .single();
      
      const role = data?.Role || 'auditor';
      setUserRole(role);
      
      const savedTab = localStorage.getItem('auditoria_active_tab') as ActiveTab;
      if (savedTab) {
        setActiveTab(savedTab);
      } else {
        changeTab(role === 'admin' ? 'ingestion' : 'mission');
      }
    } catch (err) {
      console.error("Error obteniendo rol", err);
      setUserRole('auditor');
      setActiveTab('mission');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuth(session?.user || null, session); 
      if (session?.user) {
        fetchUserRole(session.user.id).then(() => setIsCheckingAuth(false));
      } else {
        setIsCheckingAuth(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuth(session?.user || null, session); 
      if (session?.user) {
        fetchUserRole(session.user.id).then(() => setIsCheckingAuth(false));
      } else {
        setUserRole(null);
        setIsCheckingAuth(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth]);

  const refreshConnectionAndQueue = async () => {
    if (!session) return;
    const status = await checkSupabaseConnection();
    setDbStatus(status);
    const count = await getOfflineQueueCount();
    setQueuedEvents(count);

    if (isOnline) {
      try {
        const { data } = await supabase
          .from('Read_Missions')
          .select('*')
          .eq('IsGlobalActive', true)
          .maybeSingle();

        if (data) {
          setActiveMission({
            missionId: data.MissionId,
            name: data.Name,
            depositCode: data.DepositCode,
            totalSkus: data.TotalSkus,
            countedSkus: data.CountedSkus,
            pendingSkus: data.PendingSkus,
            discrepantSkus: data.DiscrepantSkus, 
            reconciledSkus: data.ReconciledSkus,
            totalCostDiscrepancy: data.TotalCostDiscrepancy ?? 0,
            status: data.Status
          });

          if (data.MissionId !== activeMissionId) {
            lastBroadcastedMissionRef.current = data.MissionId;
            setActiveMissionId(data.MissionId);
            await fetchMissionTasks(data.MissionId);
            showToast(`Misión Anclada: ${data.Name}`, 'success');
          }
        }
      } catch (err) {
        console.warn('Error validando misión global', err);
      }
    }
  };

  useEffect(() => {
    if (!session) return;
    refreshConnectionAndQueue();
    const interval = setInterval(refreshConnectionAndQueue, 15000);

    const unsubscribeSync = subscribeToSync((progress, syncing) => {
      setQueuedEvents(progress.remaining);
      if (progress.processed > 0 && !syncing) {
        showToast(`${progress.processed} eventos sincronizados con éxito`, 'success');
        if (activeMissionId) {
          fetchMissionTasks(activeMissionId);
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribeSync();
    };
  }, [activeMissionId, fetchMissionTasks, session, isOnline]);

  useEffect(() => {
    if (userRole === 'admin' && activeMissionId && activeMissionId !== lastBroadcastedMissionRef.current && isOnline) {
      const broadcastMissionToAll = async () => {
        lastBroadcastedMissionRef.current = activeMissionId;
        try {
          await supabase.from('Read_Missions').update({ IsGlobalActive: false }).neq('MissionId', activeMissionId);
          await supabase.from('Read_Missions').update({ IsGlobalActive: true }).eq('MissionId', activeMissionId);
          showToast('Misión anclada para todos los operadores', 'success');
        } catch (err) {
          console.error('Error al hacer broadcast de la misión', err);
        }
      };
      broadcastMissionToAll();
    }
  }, [activeMissionId, userRole, isOnline]);

  useEffect(() => {
    if (!session) return;
    const handleOnline = async () => {
      console.log('[PWA] Conexión a Internet restablecida. Procesando cola offline...');
      showToast('Conexión reestablecida. Sincronizando eventos pendientes...', 'success');
      setIsManualSyncing(true);
      try {
        await processOfflineQueue();
        const count = await getOfflineQueueCount();
        setQueuedEvents(count);
        if (activeMissionId) {
          await fetchMissionTasks(activeMissionId);
        }
      } catch (err) {
        console.warn('[PWA] Error durante sincronización automática al volver online:', err);
      } finally {
        setIsManualSyncing(false);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [activeMissionId, fetchMissionTasks, session]);

  const handleManualSync = async () => {
    if (!isOnline) {
      showToast('Sin conexión a Internet para sincronizar', 'warning');
      return;
    }
    setIsManualSyncing(true);
    try {
      const result = await processOfflineQueue();
      const count = await getOfflineQueueCount();
      setQueuedEvents(count);
      if (result.processed > 0) {
        showToast(`${result.processed} eventos subidos a Supabase con éxito`, 'success');
        if (activeMissionId) {
          await fetchMissionTasks(activeMissionId);
        }
      } else if (result.remaining === 0) {
        showToast('Todos los eventos locales ya están sincronizados', 'success');
      }
    } catch {
      showToast('Error durante la sincronización', 'error');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const showToast = (text: string, type: 'success' | 'warning' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleQuickLogin = async (email: string, pass: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) setLoginError('Error de acceso. Verifique los usuarios en Supabase.');
    setIsLoggingIn(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('auditoria_active_tab'); 
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center space-y-4">
        <RefreshCw className="w-8 h-8 text-[#009045] animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4 selection:bg-[#009045] selection:text-white">
        <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-[12px] p-8 modal-elevation relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-accent-gradient" />
          
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-[12px] bg-[#009045]/10 flex items-center justify-center mb-4 border border-[#009045]/20">
               <Fingerprint className="w-8 h-8 text-[#009045]" />
            </div>
            <h1 className="text-2xl font-black text-[#1F2937] leading-none">SELECCIONA TU <span className="text-[#009045]">USUARIO</span></h1>
            <p className="text-[#6B7280] text-sm mt-2 text-center">Toca tu nombre para acceder al sistema.</p>
          </div>

          <div className="space-y-3">
            {KIOSK_USERS.map((u) => (
              <button
                key={u.name}
                onClick={() => handleQuickLogin(u.email, u.pass)}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-between p-4 bg-[#F8F9FA] hover:bg-white border border-[#E5E7EB] hover:border-[#263988] rounded-[8px] transition-all group disabled:opacity-50 card-elevation"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-[8px] ${u.bg} flex items-center justify-center`}>
                    <u.icon className={`w-5 h-5 ${u.color}`} />
                  </div>
                  <span className="text-[#1F2937] font-bold text-lg">{u.name}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-[#E5E7EB] flex items-center justify-center group-hover:bg-[#009045] group-hover:text-white transition-colors">
                  <RefreshCw className={`w-4 h-4 text-[#1F2937] group-hover:text-white ${isLoggingIn ? 'animate-spin' : 'hidden'}`} />
                  <ArrowRight className={`w-4 h-4 text-[#1F2937] group-hover:text-white ${isLoggingIn ? 'hidden' : 'block'}`} />
                </div>
              </button>
            ))}
          </div>

          {loginError && <div className="mt-4 p-3 bg-red-50 border border-[#DC2626] rounded-[8px] text-[#DC2626] text-xs font-semibold text-center">{loginError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1F2937] flex flex-col font-sans pb-24 antialiased selection:bg-[#009045] selection:text-white">
      <header className="sticky top-0 z-40 bg-accent-gradient border-b border-[#263988]/30 px-3 sm:px-5 py-2.5 shadow-md text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-[8px] bg-white/20 backdrop-blur-xs border border-white/30 text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0">
              A+
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-black tracking-tight text-white leading-none">
                  AUDITORIA<span className="text-emerald-200">PLUS+</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-white/15 text-white px-2 py-0.5 rounded-full border border-white/25">
                  CQRS
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                {activeMissionId ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => userRole === 'admin' && changeTab('ingestion')}
                      className={`text-[11px] font-mono font-bold flex items-center gap-1 transition ${userRole === 'admin' ? 'text-white hover:text-emerald-200' : 'text-white/90 cursor-default'}`}
                    >
                      <span>Misión: {activeMissionId.slice(0, 8)}</span>
                      {userRole === 'admin' && <ChevronRight className="w-3 h-3 text-white/70" />}
                    </button>

                    {/* BOTÓN FASE 2: INICIAR ENRIQUECIMIENTO (SOLO ADMIN) */}
                    {userRole === 'admin' && !isEnriching && (
                      <button
                        onClick={() => runMissionEnrichment(activeMissionId, (activeMission?.depositCode || activeMission?.DepositCode || '150101') as string)}
                        className="bg-white/15 hover:bg-white/25 border border-white/30 text-white px-2 py-0.5 rounded-[8px] text-[9px] uppercase font-bold transition flex items-center"
                      >
                        <Database className="w-3 h-3 mr-1" /> Extraer de API
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => userRole === 'admin' && changeTab('ingestion')}
                    className={`text-[11px] font-bold flex items-center gap-1 ${userRole === 'admin' ? 'text-amber-200 hover:text-white' : 'text-white/80 cursor-default'}`}
                  >
                    <span>{userRole === 'admin' ? 'Seleccionar misión' : 'Esperando asignación...'}</span>
                    {userRole === 'admin' && <ChevronRight className="w-3 h-3 text-white/70" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden xs:flex items-center gap-1.5 text-xs text-white bg-white/15 border border-white/20 px-2.5 py-1 rounded-full">
              <User className="w-3 h-3" /> 
              <span className="capitalize font-bold text-white">{session.user.email?.split('@')[0]}</span>
              <span className="uppercase text-[10px] text-emerald-200 ml-1 font-bold">({userRole})</span>
            </div>

            {queuedEvents > 0 && (
              <button
                onClick={handleManualSync}
                disabled={isManualSyncing || !isOnline}
                title="Eventos almacenados localmente en IndexedDB. Clic para sincronizar."
                className="btn-collector bg-[#F59E0B] text-[#1F2937] hover:bg-[#d98205] px-2.5 py-1 rounded-[8px] text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing ? 'animate-spin' : ''}`} />
                <span className="font-mono">{queuedEvents}</span>
              </button>
            )}

            <div
              className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold flex items-center gap-1 border transition ${
                isOnline
                  ? 'bg-white/20 border-white/30 text-white'
                  : 'bg-[#DC2626] border-white/40 text-white animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-white" /> : <WifiOff className="w-3.5 h-3.5 text-white" />}
            </div>

            <button onClick={handleLogout} className="p-1.5 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-[8px] transition" title="Salir">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --- FASE 2: BARRA DE PROGRESO DE EXTRACCIÓN API --- */}
      {isEnriching && (
        <div className="w-full bg-[#263988] border-b border-[#263988]/50 px-4 py-3 sticky top-[58px] z-30 shadow-md animate-slideDown text-white">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-between items-end mb-2">
              <span className="text-[11px] sm:text-xs font-black text-white/90 tracking-widest flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-[#009045]" />
                VALIDANDO DATOS CONTRA MARAPLUS PORTAL...
              </span>
              <span className="text-[11px] sm:text-xs font-mono font-bold text-white">
                {enrichProgress.current} / {enrichProgress.total} SKUs
              </span>
            </div>
            <div className="w-full bg-white/20 h-2 sm:h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-[#009045] h-full transition-all duration-300"
                style={{ width: `${enrichProgress.total > 0 ? (enrichProgress.current / enrichProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-3 sm:p-5 max-w-5xl mx-auto w-full space-y-4">
        {activeTab === 'ingestion' && userRole === 'admin' && (
          <TabIngestion onMissionSelected={() => changeTab('mission')} />
        )}

        {activeTab === 'mission' && (
          <div className="space-y-4">
            <TabCollector onNavigateToFloor={() => changeTab('discrepancies')} />
          </div>
        )}

        {activeTab === 'discrepancies' && (
          <TabFloorReconciliation />
        )}

        {activeTab === 'reports' && (
          <TabReports />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E5E7EB] card-elevation safe-area-bottom">
        <div className="max-w-lg mx-auto flex items-center justify-around px-2 py-1.5">
          {userRole === 'admin' && (
            <button
              onClick={() => changeTab('ingestion')}
              className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-1 px-1 rounded-[8px] font-bold text-[11px] transition touch-manipulation active:scale-95 ${
                activeTab === 'ingestion'
                  ? 'text-[#263988] bg-[#263988]/10 border border-[#263988]/20'
                  : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA]'
              }`}
            >
              <UploadCloud className="w-5 h-5 mb-0.5" />
              <span>Misiones</span>
            </button>
          )}

          <button
            onClick={() => changeTab('mission')}
            className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-1 px-1 rounded-[8px] font-bold text-[11px] transition touch-manipulation active:scale-95 ${
              activeTab === 'mission'
                ? 'text-[#009045] bg-[#009045]/10 border border-[#009045]/30'
                : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA]'
            }`}
          >
            <Barcode className="w-5 h-5 mb-0.5" />
            <span>Almacén</span>
          </button>

          <button
            onClick={() => changeTab('discrepancies')}
            className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-1 px-1 rounded-[8px] font-bold text-[11px] transition touch-manipulation relative active:scale-95 ${
              activeTab === 'discrepancies'
                ? 'text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30'
                : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA]'
            }`}
          >
            <div className="relative">
              <AlertTriangle className="w-5 h-5 mb-0.5" />
              {pendingFloorDiscrepancies.length > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-[#F59E0B] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[16px] text-center shadow-xs">
                  {pendingFloorDiscrepancies.length}
                </span>
              )}
            </div>
            <span>Piso (150103)</span>
          </button>

          <button
            onClick={() => changeTab('reports')}
            className={`flex-1 flex flex-col items-center justify-center min-h-[56px] py-1 px-1 rounded-[8px] font-bold text-[11px] transition touch-manipulation active:scale-95 ${
              activeTab === 'reports'
                ? 'text-[#263988] bg-[#263988]/10 border border-[#263988]/20'
                : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F8F9FA]'
            }`}
          >
            <FileText className="w-5 h-5 mb-0.5" />
            <span>Reportes</span>
          </button>
        </div>
      </nav>

      {toastMessage && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-[12px] modal-elevation text-xs sm:text-sm font-bold flex items-center gap-2.5 max-w-md w-[90%] border bg-white text-[#1F2937] animate-slideUp ${
            toastMessage.type === 'success'
              ? 'border-[#009045]'
              : toastMessage.type === 'warning'
              ? 'border-[#F59E0B]'
              : 'border-[#DC2626]'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#009045] shrink-0" />}
          {toastMessage.type === 'warning' && <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0" />}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
}