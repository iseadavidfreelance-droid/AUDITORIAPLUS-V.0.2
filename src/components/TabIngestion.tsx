/**
 * AUDITORIAPLUS+ - Tab Ingesta de Misiones y Dashboard de Auditorías
 * Carga directa de un único archivo Excel (Kardex) hacia Supabase Edge Function 'ingest-excel'.
 * Lectura en tiempo real de Read_Missions y selección de misión activa.
 * REGLA DE ORO: Cero datos mock o simulados. Conexión 100% real a PostgreSQL.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Layers,
  Calendar,
  ShieldCheck,
  ArrowRight,
  Hash,
  Database,
  Check,
  AlertCircle,
  Trash2 // Asegurado de que Trash2 esté importado
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useMissionStore } from '../store/useMissionStore';
import { DepositCode, DEPOSIT_NAMES } from '../types/audit';

interface MissionRecord {
  MissionId: string;
  Name?: string;
  MissionName?: string;
  DepositCode: string;
  ExcelHashSHA256?: string;
  ExcelHash?: string;
  Status: string;
  TotalSkus?: number;
  TotalTasks?: number;
  CountedSkus?: number;
  CompletedTasks?: number;
  PendingSkus?: number;
  DiscrepantSkus?: number;
  ReconciledSkus?: number;
  ReconciledTasks?: number;
  CreatedAt: string;
  UpdatedAt?: string;
}

interface TabIngestionProps {
  onMissionSelected?: (missionId: string) => void;
}

export const TabIngestion: React.FC<TabIngestionProps> = ({ onMissionSelected }) => {
  const {
    activeMissionId,
    setActiveMissionId,
    fetchMissionTasks,
    setActiveMission,
    isOnline,
  } = useMissionStore();

  // Estados de Ingesta BLINDADOS (AHORA 1 SOLO ARCHIVO KARDEX)
  const [fileA, setFileA] = useState<File | null>(null);
  const [missionName, setMissionName] = useState<string>('');
  const [depositCode, setDepositCode] = useState<DepositCode>('150101');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    hash?: string;
    missionId?: string;
    totalTasks?: number;
    error?: string;
  } | null>(null);

  // Estados de Listado de Misiones
  const [missions, setMissions] = useState<MissionRecord[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState<boolean>(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);

  const fileInputARef = useRef<HTMLInputElement>(null);

  // 1. Cargar misiones reales desde Read_Missions en Supabase
  const loadMissions = async () => {
    if (!isSupabaseConfigured) {
      setMissionsError('Supabase no está configurado. Configure VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en su archivo de entorno.');
      return;
    }

    setIsLoadingMissions(true);
    setMissionsError(null);

    try {
      const { data, error } = await supabase
        .from('Read_Missions')
        .select('*')
        .order('CreatedAt', { ascending: false });

      if (error) {
        console.error('[TabIngestion] Error al consultar Read_Missions:', error);
        setMissionsError(error.message);
        setMissions([]);
      } else if (data) {
        setMissions(data as MissionRecord[]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[TabIngestion] Excepción al leer misiones:', msg);
      setMissionsError(msg);
      setMissions([]);
    } finally {
      setIsLoadingMissions(false);
    }
  };

  useEffect(() => {
    loadMissions();
  }, [isOnline]);

  const handleFileAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFileA(selectedFile);
      setUploadResult(null);

      if (!missionName) {
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setMissionName(`Auditoría ${nameWithoutExt}`);
      }
    }
  };

  // 2. Envío a la Edge Function 'ingest-excel' (BLINDADO CON FETCH NATIVO Y 1 ARCHIVO)
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileA) {
      setUploadResult({
        success: false,
        error: 'Obligatorio: Debes cargar el Archivo de Inventario Kardex consolidado.',
      });
      return;
    }

    if (!isSupabaseConfigured) {
      setUploadResult({
        success: false,
        error: 'Supabase no está configurado. No se puede invocar la Edge Function ingest-excel.',
      });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file_a', fileA);
      formData.append('deposit_code', depositCode);
      formData.append(
        'mission_name',
        missionName.trim() || `Auditoría ${new Date().toLocaleDateString('es-ES')}`
      );

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/ingest-excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          response.status === 409
            ? 'Conflicto (409): Esta misión ya ha sido ingerida previamente. El hash SHA-256 es idéntico a una existente.'
            : responseData.error || 'Error en la Edge Function ingest-excel.';

        setUploadResult({
          success: false,
          error: errorMsg,
        });
      } else {
        const data = responseData;
        const hash = data?.excel_hash || data?.excel_hash_sha256 || data?.data?.excel_hash_sha256 || 'Calculado en backend';
        const newMissionId = data?.mission_id || data?.data?.mission_id;
        const total = data?.total_tasks || data?.data?.total_tasks || 0;

        setUploadResult({
          success: true,
          hash,
          missionId: newMissionId,
          totalTasks: total,
        });

        // Limpiar archivo seleccionado
        setFileA(null);
        if (fileInputARef.current) fileInputARef.current.value = '';

        await loadMissions();
        if (newMissionId) {
          await handleSelectMission(newMissionId);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadResult({
        success: false,
        error: `Fallo de conexión al enviar archivo: ${msg}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Función de Eliminación añadida
  const handleDeleteMission = async (missionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("¿Estás seguro de eliminar esta misión? Esta acción es irreversible.")) return;

    try {
      await supabase.from('Read_Missions').delete().eq('MissionId', missionId);
      if (activeMissionId === missionId) {
        setActiveMissionId(null);
      }
      loadMissions();
    } catch (err) {
      console.error("Error al eliminar misión:", err);
      alert("No se pudo eliminar la misión.");
    }
  };

  // 3. Selección de Misión
  const handleSelectMission = async (missionId: string) => {
    setActiveMissionId(missionId);

    const selected = missions.find((m) => m.MissionId === missionId);
    if (selected) {
      const total = Number(selected.TotalSkus || selected.TotalTasks || 0);
      const counted = Number(selected.CountedSkus || selected.CompletedTasks || 0);
      const pending = Number(selected.PendingSkus ?? Math.max(0, total - counted));
      const discrepant = Number(selected.DiscrepantSkus || 0);
      const reconciled = Number(selected.ReconciledSkus || selected.ReconciledTasks || 0);

      setActiveMission({
        missionId: selected.MissionId,
        name: selected.Name || selected.MissionName || `Misión ${selected.MissionId.slice(0, 8)}`,
        depositCode: (selected.DepositCode as DepositCode) || '150101',
        totalSkus: total,
        countedSkus: counted,
        pendingSkus: pending,
        discrepantSkus: discrepant,
        reconciledSkus: reconciled,
        totalCostDiscrepancy: 0,
        status: (selected.Status as 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED') || 'IN_PROGRESS',
        createdAt: selected.CreatedAt,
      });
    }

    await fetchMissionTasks(missionId);

    if (onMissionSelected) {
      onMissionSelected(missionId);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECCIÓN 1: FORMULARIO DE INGESTA DE ARCHIVOS BLINDADO */}
      <section className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 sm:p-6 card-elevation">
        <div className="flex items-center gap-3 pb-4 border-b border-[#E5E7EB]">
          <div className="w-10 h-10 rounded-[8px] bg-[#009045]/10 border border-[#009045]/20 text-[#009045] flex items-center justify-center shrink-0">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#1F2937] tracking-tight">
              Ingesta de Inventario a Supabase
            </h2>
            <p className="text-xs text-[#6B7280]">
              Carga estrictamente el archivo del Kardex consolidado para inicializar la misión.
            </p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1">
                Depósito a Auditar (Misión Base)
              </label>
              <select
                value={depositCode}
                onChange={(e) => setDepositCode(e.target.value as DepositCode)}
                className="w-full h-11 px-3 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px] text-[#1F2937] font-medium text-sm focus:outline-hidden focus:border-[#009045]"
                disabled={isUploading}
              >
                <option value="150101">150101 - Almacén Principal (Origen)</option>
                <option value="150103">150103 - Piso de Venta (Solo si es misión directa)</option>
                <option value="150102">150102 - Avería / Merma</option>
                <option value="150107">150107 - Galpón</option>
              </select>
              <p className="text-[10px] text-[#6B7280] mt-1">
                Nota: El destino de validación cruzada se asignará automáticamente.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-1">
                Nombre de la Misión
              </label>
              <input
                type="text"
                value={missionName}
                onChange={(e) => setMissionName(e.target.value)}
                placeholder="Ej: Auditoría Almacén Q3 - Central"
                className="w-full h-11 px-3.5 bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px] text-[#1F2937] font-medium text-sm focus:outline-hidden focus:border-[#009045]"
                disabled={isUploading}
              />
            </div>
          </div>

          <div className="pt-2">
            <div className={`p-4 border rounded-[8px] transition ${fileA ? 'border-[#009045] bg-[#009045]/5' : 'border-[#E5E7EB] bg-[#F8F9FA]'}`}>
              <label className="block text-xs font-bold text-[#1F2937] uppercase tracking-wider mb-2">
                Archivo de Inventario (KARDEX / EXCEL)
              </label>
              <input
                ref={fileInputARef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileAChange}
                disabled={isUploading}
                className="block w-full text-sm text-[#6B7280] file:mr-4 file:py-2 file:px-4 file:rounded-[8px] file:border-0 file:text-xs file:font-bold file:bg-[#263988] file:text-white hover:file:bg-[#1d2c6b] cursor-pointer"
              />
              {fileA && <p className="text-xs text-[#009045] mt-2 font-medium break-all">{fileA.name}</p>}
            </div>
          </div>

          {uploadResult && (
            <div
              className={`p-3.5 rounded-[8px] border text-xs sm:text-sm font-medium ${
                uploadResult.success
                  ? 'bg-emerald-50 border-[#009045] text-[#009045]'
                  : 'bg-red-50 border-[#DC2626] text-[#DC2626]'
              }`}
            >
              {uploadResult.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-[#009045]">
                    <CheckCircle2 className="w-4 h-4 text-[#009045]" />
                    <span>Misión creada e ingesta completada con éxito</span>
                  </div>
                  {uploadResult.hash && (
                    <div className="flex items-center gap-1.5 text-xs text-[#6B7280] font-mono break-all pt-1">
                      <Hash className="w-3.5 h-3.5 text-[#009045] shrink-0" />
                      <span>SHA-256: {uploadResult.hash}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-[#DC2626]">Fallo en la ingesta</span>
                    <span>{uploadResult.error}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!fileA || isUploading}
            className="w-full btn-collector bg-[#009045] hover:bg-[#007a3a] disabled:opacity-50 disabled:cursor-not-allowed text-white min-h-[48px] rounded-[8px] font-black text-sm flex items-center justify-center gap-2 shadow-md transition mt-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Procesando archivo en la Nube...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                <span>Iniciar Ingesta Definitiva</span>
              </>
            )}
          </button>
        </form>
      </section>

      {/* SECCIÓN 2: LISTA DE MISIONES ACTIVAS Y SELECCIÓN */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#263988]" />
            <h3 className="text-base font-black text-[#1F2937]">Misiones en la Base de Datos</h3>
            <span className="text-xs font-mono bg-[#F8F9FA] text-[#1F2937] px-2.5 py-0.5 rounded-full border border-[#E5E7EB]">
              {missions.length}
            </span>
          </div>

          <button
            onClick={loadMissions}
            disabled={isLoadingMissions}
            className="p-2 text-xs font-bold text-[#1F2937] hover:text-[#263988] bg-white hover:bg-[#F8F9FA] border border-[#E5E7EB] rounded-[8px] flex items-center gap-1.5 min-h-[38px] transition"
            title="Recargar misiones desde Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMissions ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>

        {missionsError && (
          <div className="bg-red-50 border border-[#DC2626] p-3.5 rounded-[8px] text-xs text-[#DC2626] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Error al consultar Read_Missions:</span>
              <span>{missionsError}</span>
            </div>
          </div>
        )}

        {isLoadingMissions && missions.length === 0 ? (
          <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-8 text-center text-[#6B7280] space-y-2 card-elevation">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-[#263988]" />
            <p className="text-sm font-semibold text-[#1F2937]">Consultando Read_Missions en PostgreSQL...</p>
          </div>
        ) : missions.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#E5E7EB] rounded-[12px] p-8 text-center text-[#6B7280] space-y-2 card-elevation">
            <Database className="w-10 h-10 mx-auto text-[#6B7280]" />
            <h4 className="text-sm font-bold text-[#1F2937]">No hay misiones registradas</h4>
            <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
              Utiliza el formulario superior para cargar el archivo Excel o CSV y desplegar la primera misión de auditoría.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {missions.map((mission) => {
              const isActive = activeMissionId === mission.MissionId;
              const totalSkus = Number(mission.TotalSkus || mission.TotalTasks || 0);
              const countedSkus = Number(mission.CountedSkus || mission.CompletedTasks || 0);
              const discrepantSkus = Number(mission.DiscrepantSkus || 0);
              const progress = totalSkus > 0 ? Math.min(100, Math.round((countedSkus / totalSkus) * 100)) : 0;
              const createdDate = new Date(mission.CreatedAt).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={mission.MissionId}
                  className={`bg-white border rounded-[12px] p-4 transition card-elevation flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'border-2 border-[#263988]'
                      : 'border-[#E5E7EB] hover:border-[#263988]/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider bg-[#F8F9FA] text-[#1F2937] px-2.5 py-0.5 rounded-full border border-[#E5E7EB]">
                            {DEPOSIT_NAMES[mission.DepositCode as DepositCode] || `Depósito ${mission.DepositCode}`}
                          </span>
                          {isActive && (
                            <span className="text-[10px] uppercase font-black tracking-wider bg-[#009045]/10 text-[#009045] px-2.5 py-0.5 rounded-full border border-[#009045]/20 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Activa
                            </span>
                          )}
                        </div>
                        <h4 className="text-base font-bold text-[#1F2937] mt-1.5 leading-snug">
                          {mission.Name || mission.MissionName || 'Auditoría General'}
                        </h4>
                      </div>
                      
                      {/* Botón Eliminar conservado */}
                      <button 
                        onClick={(e) => handleDeleteMission(mission.MissionId, e)}
                        className="p-2 bg-red-50 text-[#DC2626] hover:bg-[#DC2626] hover:text-white rounded-[8px] transition shrink-0"
                        title="Eliminar misión permanentemente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-[11px] text-[#6B7280] space-y-0.5">
                      <div className="flex items-center gap-1 font-mono text-[10px] text-[#6B7280] truncate">
                        <Hash className="w-3 h-3 shrink-0" />
                        <span>{mission.MissionId}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[#6B7280]">
                        <Calendar className="w-3 h-3 text-[#6B7280] shrink-0" />
                        <span>{createdDate}</span>
                      </div>
                    </div>

                    <div className="bg-[#F8F9FA] p-2.5 rounded-[8px] border border-[#E5E7EB] space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-[#6B7280]">Progreso de Conteo:</span>
                        <span className="font-mono text-[#1F2937]">
                          {countedSkus} / {totalSkus} SKUs ({progress}% )
                        </span>
                      </div>
                      <div className="w-full bg-[#E5E7EB] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#009045] h-full transition-all duration-300 rounded-full"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {discrepantSkus > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-[#F59E0B] font-semibold pt-0.5">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          <span>{discrepantSkus} discrepancias detectadas</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectMission(mission.MissionId)}
                    disabled={isActive}
                    className={`btn-collector w-full min-h-[48px] rounded-[8px] font-bold text-sm flex items-center justify-center gap-2 transition ${
                      isActive
                        ? 'bg-[#F8F9FA] text-[#6B7280] cursor-default border border-[#E5E7EB]'
                        : 'bg-[#263988] hover:bg-[#1d2c6b] text-white shadow-xs active:scale-[0.99]'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-[#009045]" />
                        <span>Misión Seleccionada</span>
                      </>
                    ) : (
                      <>
                        <span>Seleccionar Misión</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default TabIngestion;