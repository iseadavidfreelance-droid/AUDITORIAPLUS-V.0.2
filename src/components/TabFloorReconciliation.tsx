/**
 * AUDITORIAPLUS+ - Tab 3: Reconciliación Bidireccional (Agnóstica)
 * Flujo de Compensación Asíncrona de Inventario (Origen vs Destino)
 * FASE 3: Fetch API en Vivo y Confirmación Humana de Traslados
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Search,
  Store,
  Layers,
  X,
  ArrowRightLeft,
  Edit2,
  Check,
  Trash2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useMissionStore } from '../store/useMissionStore';
import { useDiscrepancyStore } from '../stores/useDiscrepancyStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { enqueueOfflineEvent } from '../lib/db';
import { FloorDiscrepancy, VirtualTransfer } from '../types/audit';
import { useAuthStore } from '../stores/useAuthStore';
import { formatDepositLabel } from '../lib/deposits';

export const TabFloorReconciliation: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { activeMissionId, fetchMissionTasks, tasks } = useMissionStore();
  const user = useAuthStore((state) => state.user);

  const {
    pendingFloorDiscrepancies,
    virtualTransfers,
    setPendingDiscrepancies,
    resolveDiscrepancyLocally,
    setVirtualTransfers,
  } = useDiscrepancyStore();

  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<FloorDiscrepancy | null>(null);
  const [floorCountedInput, setFloorCountedInput] = useState<string>('');
  const [floorSystemInput, setFloorSystemInput] = useState<string>('0');
  const [apiFetchFailed, setApiFetchFailed] = useState<boolean>(false);
  const [isEditingFloorSystem, setIsEditingFloorSystem] = useState<boolean>(false);
  const [tempFloorSystemInput, setTempFloorSystemInput] = useState<string>('');

  // Estados de carga e interfaz
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isFetchingLive, setIsFetchingLive] = useState<boolean>(false);

  const [filterQuery, setFilterQuery] = useState<string>('');
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Estados para modales estilizados
  const [discrepancyToCancel, setDiscrepancyToCancel] = useState<FloorDiscrepancy | null>(null);
  const [transferToConfirm, setTransferToConfirm] = useState<any | null>(null);

  // Carga paralela: Discrepancias Pendientes + Todos los Traslados
  const fetchOpenDiscrepancies = useCallback(async () => {
    if (!activeMissionId || !isSupabaseConfigured) return;

    setIsLoading(true);
    try {
      // Garantizar que las tareas de la misión estén cargadas para resolver nombres de productos
      let currentTasks = useMissionStore.getState().tasks;
      if (currentTasks.length === 0) {
        currentTasks = await fetchMissionTasks(activeMissionId);
      }

      // 1. Carga de Discrepancias Pendientes en Piso
      const { data, error } = await supabase
        .from('Read_Floor_Discrepancies')
        .select('*')
        .eq('MissionId', activeMissionId)
        .or('Status.eq.OPEN,Status.eq.PENDING_TARGET_COUNT,Status.eq.PENDING_FLOOR_COUNT')
        .order('CreatedAt', { ascending: false });

      if (error) {
        console.warn('[TabFloorReconciliation] Error BD Discrepancias:', error);
      } else if (data) {
        // Diccionario de nombres reales desde las tareas de inventario
        const taskNameMap: Record<string, string> = {};
        for (const t of currentTasks) {
          const s = (t.SkuCode || t.skuCode || '').trim();
          const desc = t.SkuDescription || t.skuDescription;
          if (s && desc && desc.trim() !== s) {
            taskNameMap[s] = desc.trim();
          }
        }

        // Si hay SKUs sin descripción en memoria, consultar directamente Read_Mission_Tasks
        const missingSkus = data
          .map((d) => (d.SkuCode || d.skuCode || '').trim())
          .filter((s) => s && !taskNameMap[s]);

        if (missingSkus.length > 0) {
          const { data: dbTasks } = await supabase
            .from('Read_Mission_Tasks')
            .select('SkuCode, SkuDescription')
            .eq('MissionId', activeMissionId)
            .in('SkuCode', missingSkus);

          if (dbTasks) {
            for (const dt of dbTasks) {
              const s = (dt.SkuCode || '').trim();
              if (s && dt.SkuDescription && dt.SkuDescription.trim() !== s) {
                taskNameMap[s] = dt.SkuDescription.trim();
              }
            }
          }
        }

        const mappedDiscrepancies: FloorDiscrepancy[] = data.map((d) => {
          const originDisc = Number(d.OriginDiscrepancy ?? d.originDiscrepancy ?? d.WarehouseDiscrepancy ?? 0);
          const skuTrimmed = (d.SkuCode || d.skuCode || '').trim();
          const matchingTask = currentTasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === skuTrimmed);
          
          const taskName = taskNameMap[skuTrimmed] || matchingTask?.SkuDescription || matchingTask?.skuDescription;
          const isDbDescReal =
            d.SkuDescription &&
            d.SkuDescription.trim() !== skuTrimmed &&
            !/^\d{1,8}$/.test(d.SkuDescription.trim());

          const realName =
            (taskName && taskName.trim() !== skuTrimmed ? taskName : null) ||
            (isDbDescReal ? d.SkuDescription.trim() : null) ||
            'Artículo auditado';

          // Si en la BD de Supabase se había guardado el SKU redundante como descripción, actualizarlo al nombre real
          if (realName !== 'Artículo auditado' && (!d.SkuDescription || d.SkuDescription.trim() === skuTrimmed)) {
            supabase
              .from('Read_Floor_Discrepancies')
              .update({ SkuDescription: realName })
              .eq('DiscrepancyId', d.DiscrepancyId)
              .then();
          }

          return {
            discrepancyId: d.DiscrepancyId || d.discrepancyId,
            taskId: d.TaskId || d.taskId || matchingTask?.TaskId || '',
            missionId: d.MissionId || d.missionId || activeMissionId,
            skuCode: d.SkuCode || d.skuCode || '',
            skuDescription: realName,
            originDeposit: d.OriginDeposit || d.originDeposit || '150101',
            targetDeposit: d.TargetDeposit || d.targetDeposit || d.FloorDeposit || '150103',
            originDiscrepancy: originDisc,
            targetSystemQuantity: Number(d.TargetSystemQuantity ?? d.targetSystemQuantity ?? d.FloorSystemQuantity ?? 0),
            targetCountedQuantity: d.TargetCountedQuantity ?? d.targetCountedQuantity ?? null,
            targetDiscrepancy: d.TargetDiscrepancy ?? d.targetDiscrepancy ?? null,
            status: d.Status || 'OPEN',
            resolvedAt: d.ResolvedAt || null,
          };
        });
        setPendingDiscrepancies(mappedDiscrepancies as any);
      }

      // 2. CARGA CRÍTICA DE TRASLADOS: Traemos TODOS (Para no perderlos al dar F5)
      const { data: transfersData, error: transferError } = await supabase
        .from('Read_Virtual_Transfers')
        .select('*')
        .eq('MissionId', activeMissionId)
        .order('CreatedAt', { ascending: false });

      if (transferError) {
        console.warn('[TabFloorReconciliation] Error BD Traslados:', transferError);
      } else if (transfersData) {
        setVirtualTransfers(transfersData as VirtualTransfer[]);
      }
    } catch (err) {
      console.error('[TabFloorReconciliation] Fallo sincronización:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeMissionId, fetchMissionTasks, setPendingDiscrepancies, setVirtualTransfers]);

  useEffect(() => {
    fetchOpenDiscrepancies();
  }, [fetchOpenDiscrepancies, tasks.length]);

  // AL DAR CLIC EN VERIFICAR: Consulta la API en tiempo real
  const handleSelectDiscrepancy = async (disc: FloorDiscrepancy) => {
    setSelectedDiscrepancy(disc);
    setFloorCountedInput('');
    setFloorSystemInput('0');
    setApiFetchFailed(false);
    setIsEditingFloorSystem(false);
    setTempFloorSystemInput('');
    setIsFetchingLive(true);

    try {
      const res = await fetch(`https://192.168.15.225:3002/api/inventory?search=${disc.skuCode}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const targetItem = json.data.find((d: any) => d.codigo_deposito === disc.targetDeposit);
          if (targetItem) {
            setFloorSystemInput(String(targetItem.stock_quantity));
            setApiFetchFailed(false);
          } else {
            // No se encontró stock para el depósito destino en el ERP
            setFloorSystemInput(String(disc.targetSystemQuantity || 0));
            setApiFetchFailed(true);
          }
        } else {
          setFloorSystemInput(String(disc.targetSystemQuantity || 0));
          setApiFetchFailed(true);
        }
      } else {
        // Fallback al valor teórico guardado si falla la API
        setFloorSystemInput(String(disc.targetSystemQuantity || 0));
        setApiFetchFailed(true);
      }
    } catch (err) {
      console.warn('Fallo API destino:', err);
      setFloorSystemInput(String(disc.targetSystemQuantity || 0));
      setApiFetchFailed(true);
    } finally {
      setIsFetchingLive(false);
    }
  };

  const currentOriginDisc = Number(selectedDiscrepancy?.originDiscrepancy || 0);
  const floorCounted = parseFloat(floorCountedInput);
  const isFloorCountValid = !isNaN(floorCounted) && floorCounted >= 0;
  const floorSystem = parseFloat(floorSystemInput) || 0;
  const targetDiscrepancyVal = isFloorCountValid ? floorCounted - floorSystem : 0;

  // Lógica Matemática de Interfaz
  let transferQuantity = 0;
  if (currentOriginDisc < 0 && targetDiscrepancyVal > 0) {
    transferQuantity = Math.min(Math.abs(currentOriginDisc), targetDiscrepancyVal);
  } else if (currentOriginDisc > 0 && targetDiscrepancyVal < 0) {
    transferQuantity = Math.min(currentOriginDisc, Math.abs(targetDiscrepancyVal));
  }

  // --- EJECUCIÓN DEL CONTEO ---
  const handleConfirmReconciliation = async () => {
    if (!selectedDiscrepancy || !activeMissionId || !isFloorCountValid || !user) {
      showToast('Ingrese un conteo válido', 'error');
      return;
    }

    setIsSubmitting(true);
    const discId = selectedDiscrepancy.discrepancyId || '';
    const skuCode = selectedDiscrepancy.skuCode || '';
    const matchingTask = tasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === (skuCode || '').trim());
    const realSkuDesc =
      matchingTask?.SkuDescription ||
      matchingTask?.skuDescription ||
      (selectedDiscrepancy.skuDescription && selectedDiscrepancy.skuDescription !== skuCode ? selectedDiscrepancy.skuDescription : '') ||
      'Artículo auditado';

    // Tu lógica de objeto virtual para la UI
    let virtualTransfer: VirtualTransfer | undefined;
    if (transferQuantity > 0) {
      virtualTransfer = {
        TransferId: crypto.randomUUID ? crypto.randomUUID() : `trans_${Date.now()}`,
        MissionId: activeMissionId,
        TaskId: selectedDiscrepancy.taskId || matchingTask?.TaskId || '',
        SkuCode: skuCode,
        SkuDescription: realSkuDesc,
        OriginDeposit: selectedDiscrepancy.originDeposit || '150101',
        DestinationDeposit: selectedDiscrepancy.targetDeposit || '150103',
        TransferredQuantity: transferQuantity,
        CreatedAt: new Date().toISOString(),
        Status: 'SUGGESTED',
      };
    }

    // Payload de la BD
    const payload = {
      discrepancy_id: discId,
      mission_id: activeMissionId,
      sku_code: skuCode,
      sku_description: realSkuDesc,
      origin_deposit: selectedDiscrepancy.originDeposit || '150101',
      target_deposit: selectedDiscrepancy.targetDeposit || '150103',
      warehouse_discrepancy: currentOriginDisc,
      origin_discrepancy: currentOriginDisc,
      floor_counted_qty: floorCounted,
      target_counted_quantity: floorCounted,
      floor_system_qty: floorSystem,
      target_system_quantity: floorSystem,
      sales_during_audit: 0,
      user_id: user.id,
    };

    try {
      if (isOnline && isSupabaseConfigured) {
        // 1. Actualización directa de la tabla Read_Floor_Discrepancies garantizando persistencia del TargetSystemQuantity y SkuDescription
        await supabase
          .from('Read_Floor_Discrepancies')
          .update({
            SkuDescription: realSkuDesc,
            TargetSystemQuantity: floorSystem,
            TargetCountedQuantity: floorCounted,
            TargetDiscrepancy: targetDiscrepancyVal,
            Status: transferQuantity > 0 ? 'PENDING_TRANSFER_APPROVAL' : 'RESOLVED',
            UpdatedAt: new Date().toISOString(),
          })
          .eq('DiscrepancyId', discId);

        // 2. Si hay traslado sugerido, persistirlo de inmediato en Read_Virtual_Transfers según el esquema oficial en /docs
        if (transferQuantity > 0 && virtualTransfer) {
          await supabase
            .from('Read_Virtual_Transfers')
            .upsert({
              TransferId: virtualTransfer.TransferId,
              MissionId: activeMissionId,
              SkuCode: skuCode,
              SkuDescription: realSkuDesc,
              FromDeposit: selectedDiscrepancy.originDeposit || '150101',
              ToDeposit: selectedDiscrepancy.targetDeposit || '150103',
              TransitDeposit: '150104',
              TransferQuantity: transferQuantity,
              Status: 'SUGGESTED',
              CreatedAt: new Date().toISOString(),
              UpdatedAt: new Date().toISOString(),
            });
        }

        const { error } = await supabase.functions.invoke('register-floor-count', { body: payload });
        if (error) {
          console.warn('[TabFloorReconciliation] Edge function retornó advertencia:', error);
        }
      } else {
        await enqueueOfflineEvent({
          type: 'register-floor-count',
          missionId: activeMissionId,
          discrepancyId: discId,
          payload,
        });
      }

      resolveDiscrepancyLocally(discId, floorCounted, virtualTransfer);
      showToast(
        transferQuantity > 0
          ? `Reconciliado: Traslado sugerido de ${transferQuantity.toFixed(2)} u`
          : `Conteo registrado sin traslados.`,
        'success'
      );
      setSelectedDiscrepancy(null);
      setFloorCountedInput('');
      setApiFetchFailed(false);
      setIsEditingFloorSystem(false);
      setTempFloorSystemInput('');

      // Esperar un segundo y forzar la recarga de todo
      setTimeout(async () => {
        await fetchOpenDiscrepancies();
        if (activeMissionId) fetchMissionTasks(activeMissionId);
      }, 1000);
    } catch (err) {
      showToast('Error al registrar reconciliación', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- CANCELACIÓN MANUAL DE DISCREPANCIA FALSA (ESTADO CANCELADA) ---
  const handleConfirmCancelDiscrepancy = async () => {
    if (!discrepancyToCancel) return;
    const disc = discrepancyToCancel;
    setIsSubmitting(true);
    const nowIso = new Date().toISOString();
    const discId = disc.discrepancyId;

    try {
      if (isOnline && isSupabaseConfigured) {
        // 1. Marcar como CANCELADA en Read_Floor_Discrepancies
        const { error: updateErr } = await supabase
          .from('Read_Floor_Discrepancies')
          .update({
            Status: 'CANCELADA',
            ResolvedAt: nowIso,
            UpdatedAt: nowIso
          })
          .eq('DiscrepancyId', discId);

        if (updateErr) throw updateErr;

        // 2. Insertar evento explícito en EventStore
        const generateUUID = () => {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        };

        await supabase.from('EventStore').insert({
          EventId: generateUUID(),
          EventType: 'DiscrepancyCancelled',
          AggregateId: disc.taskId || discId,
          AggregateType: 'FloorDiscrepancy',
          UserId: user?.id || '00000000-0000-0000-0000-000000000000',
          CorrelationId: generateUUID(),
          Payload: {
            discrepancy_id: discId,
            sku_code: disc.skuCode,
            mission_id: disc.missionId,
            reason: 'MANUAL_DISCARD_BY_AUDITOR'
          },
          Metadata: {
            source: 'TabFloorReconciliation',
            auditor: user?.email?.split('@')[0] || 'Auditor'
          },
          SequenceNum: 1,
          Timestamp: nowIso,
          Version: 1
        });
      }

      // 3. Remover de estados locales reactivamente
      const remaining = pendingFloorDiscrepancies.filter((d) => d.discrepancyId !== discId);
      setPendingDiscrepancies(remaining);

      if (selectedDiscrepancy?.discrepancyId === discId) {
        setSelectedDiscrepancy(null);
      }

      showToast(`Discrepancia para SKU ${disc.skuCode} cancelada exitosamente.`, 'success');
    } catch (err) {
      console.error('Error al cancelar discrepancia:', err);
      showToast('Error al descartar la discrepancia en base de datos', 'error');
    } finally {
      setIsSubmitting(false);
      setDiscrepancyToCancel(null);
    }
  };

  // --- CONFIRMACIÓN HUMANA DEL TRASLADO (VÍA MODAL ESTILIZADO) ---
  const handleExecuteTransferConfirm = async () => {
    if (!transferToConfirm) return;
    const transfer = transferToConfirm;
    const transferQty = transfer.TransferQuantity || transfer.TransferredQuantity || 0;
    const transferIdToConfirm = transfer.TransferId || transfer.transferId;
    const missionId = transfer.MissionId || transfer.missionId;
    const skuCode = transfer.SkuCode || transfer.skuCode;
    
    setIsSubmitting(true);

    try {
      // 1. Actualización Optimista Visual Inmediata
      setVirtualTransfers(
        virtualTransfers.map((t) =>
          (t.TransferId || (t as any).transferId) === transferIdToConfirm
            ? { ...t, Status: 'COMPLETED', status: 'COMPLETED' } as any
            : t
        )
      );

      // Generador de UUID nativo para cumplir con la arquitectura estricta del EventStore
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };

      // 2. INSERCIÓN DIRECTA EN EL EVENTSTORE (Cumpliendo esquema estricto CQRS)
      const { error: eventError } = await supabase.from('EventStore').insert({
        EventId: generateUUID(),
        EventType: 'VirtualTransferExecuted',
        AggregateId: transferIdToConfirm,
        AggregateType: 'VirtualTransfer',
        UserId: user?.id || '00000000-0000-0000-0000-000000000000',
        CorrelationId: generateUUID(),
        Version: 1,
        Metadata: { appVersion: '1.0.0', source: 'TabFloorReconciliation' },
        Payload: {
          transfer_id: transferIdToConfirm,
          mission_id: missionId,
          sku_code: skuCode,
          sku_description: transfer.SkuDescription || transfer.skuDescription || 'Artículo',
          transfer_quantity: transferQty,
          from_deposit: transfer.FromDeposit || transfer.OriginDeposit,
          to_deposit: transfer.ToDeposit || transfer.DestinationDeposit
        }
      });

      if (eventError) {
        console.error('Error insertando en EventStore:', eventError);
        const { error: dbError } = await supabase
          .from('Read_Virtual_Transfers')
          .update({ Status: 'COMPLETED', UpdatedAt: new Date().toISOString() })
          .eq('TransferId', transferIdToConfirm);

        if (dbError) throw dbError;
      }

      showToast('Traslado confirmado exitosamente en el ERP.', 'success');

      // 3. Refrescar vistas para sincronizar la matemática en Reportes
      setTimeout(async () => {
        await fetchOpenDiscrepancies();
        if (activeMissionId) fetchMissionTasks(activeMissionId);
      }, 1000);
      
    } catch (err) {
      console.error('Error aprobando traslado:', err);
      showToast('Error al confirmar el traslado. Revisa la consola.', 'error');
      await fetchOpenDiscrepancies();
    } finally {
      setIsSubmitting(false);
      setTransferToConfirm(null);
    }
  };

  const showToast = (text: string, type: 'success' | 'warning' | 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const filteredDiscrepancies = pendingFloorDiscrepancies.filter((d) => {
    const q = filterQuery.toLowerCase().trim();
    if (!q) return true;
    return (d.skuCode || '').toLowerCase().includes(q) || (d.skuDescription || '').toLowerCase().includes(q);
  });

  // FILTRO ESTRICTO: Solo mostrar "SUGGESTED" en la tabla de Pendientes de Confirmación (Previene F5 bug)
  const pendingSuggestedTransfers = virtualTransfers.filter(
    (tr: any) => tr.Status === 'SUGGESTED' || tr.status === 'SUGGESTED'
  );

  return (
    <div className="space-y-5 max-w-4xl mx-auto w-full pb-8">
      {/* HEADER DE INSTRUCCIONES */}
      <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 sm:p-5 card-elevation text-[#1F2937]">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-[#263988]/10 rounded-[8px] text-[#263988] shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-black text-[#263988] tracking-tight flex items-center gap-2">
              <span>Reconciliación Asíncrona: Validación de Destino</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
              Los artículos listados abajo presentaron diferencias al auditar en origen. Verifique físicamente el destino para compensar automáticamente. Los traslados generados requerirán confirmación manual del administrador.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filtrar por SKU o descripción..."
            className="w-full h-11 pl-10 pr-3 bg-white border border-[#E5E7EB] rounded-[8px] text-[#1F2937] font-mono text-sm focus:border-[#009045] focus:outline-hidden"
          />
        </div>
        <button
          onClick={fetchOpenDiscrepancies}
          disabled={isLoading}
          className="btn-collector bg-white hover:bg-[#F8F9FA] text-[#1F2937] px-4 rounded-[8px] text-xs font-bold flex items-center justify-center gap-2 min-h-[44px] border border-[#E5E7EB]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#263988]' : ''}`} />
          <span>Refrescar Lista</span>
        </button>
      </div>

      {/* FORMULARIO ACTIVO (Si hay un item seleccionado) */}
      {selectedDiscrepancy && (
        <div className="bg-white border-2 border-[#263988] rounded-[12px] p-4 sm:p-6 card-elevation space-y-4 animate-fadeIn">
          <div className="flex items-start justify-between pb-3 border-b border-[#E5E7EB]">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-black bg-[#263988]/10 text-[#263988] px-2.5 py-0.5 rounded-full border border-[#263988]/20">
                  SKU: {selectedDiscrepancy.skuCode}
                </span>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                    currentOriginDisc < 0
                      ? 'text-[#DC2626] bg-red-50 border-[#DC2626]/20'
                      : 'text-[#263988] bg-[#263988]/10 border-[#263988]/20'
                  }`}
                >
                  {currentOriginDisc < 0 ? 'Faltante Origen' : 'Sobrante Origen'}:{' '}
                  {currentOriginDisc > 0 ? `+${currentOriginDisc.toFixed(2)}` : currentOriginDisc.toFixed(2)} u
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-[#1F2937] mt-1.5 leading-tight">
                {(() => {
                  const skuTrimmed = (selectedDiscrepancy.skuCode || '').trim();
                  const matchingTask = tasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === skuTrimmed);
                  const taskDesc = matchingTask?.SkuDescription || matchingTask?.skuDescription;
                  const isDiscReal = selectedDiscrepancy.skuDescription && selectedDiscrepancy.skuDescription.trim() !== skuTrimmed && !/^\d{1,8}$/.test(selectedDiscrepancy.skuDescription.trim());
                  return (taskDesc && taskDesc.trim() !== skuTrimmed ? taskDesc : null) || (isDiscReal ? selectedDiscrepancy.skuDescription : null) || 'Artículo auditado';
                })()}
              </h3>
            </div>
            <button
              onClick={() => setSelectedDiscrepancy(null)}
              className="p-1.5 bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] rounded-[8px] text-xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#1F2937] mb-1.5 uppercase tracking-wider">
                CONTADO EN DESTINO ({formatDepositLabel(selectedDiscrepancy.targetDeposit)}):
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={floorCountedInput}
                onChange={(e) => setFloorCountedInput(e.target.value)}
                disabled={isFetchingLive}
                placeholder="0.00"
                className="w-full h-16 px-4 bg-[#F8F9FA] border-2 border-[#009045] rounded-[8px] text-[#1F2937] font-mono text-3xl font-black text-center disabled:opacity-50 focus:outline-hidden"
                autoFocus
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5">
                  <span>TEÓRICO ERP ({formatDepositLabel(selectedDiscrepancy.targetDeposit || '150103')}):</span>
                  {!isFetchingLive && (
                    apiFetchFailed ? (
                      <span className="text-[10px] text-[#F59E0B] font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-[#F59E0B]/30">
                        Sin conexión ERP
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#009045] font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-[#009045]/30">
                        Dato en vivo ERP
                      </span>
                    )
                  )}
                </label>
                <div className="flex items-center gap-1.5">
                  {isFetchingLive && <RefreshCw className="w-4 h-4 animate-spin text-[#263988]" />}
                  {apiFetchFailed && !isFetchingLive && !isEditingFloorSystem && (
                    <button
                      type="button"
                      onClick={() => {
                        setTempFloorSystemInput(floorSystemInput);
                        setIsEditingFloorSystem(true);
                      }}
                      className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-[#263988] border border-[#263988]/30 rounded-[6px] text-[11px] font-bold flex items-center gap-1 transition"
                      title="Desbloquear para agregar cantidad teórica manualmente por fallo de API"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Ajustar</span>
                    </button>
                  )}
                </div>
              </div>

              {isEditingFloorSystem ? (
                <div className="w-full h-16 flex items-center justify-center bg-white border-2 border-[#263988] rounded-[8px] px-3 gap-2 shadow-xs">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={tempFloorSystemInput}
                    onChange={(e) => setTempFloorSystemInput(e.target.value)}
                    className="w-28 text-center text-2xl font-black font-mono border-b-2 border-[#263988] bg-transparent text-[#1F2937] focus:outline-hidden"
                    autoFocus
                    placeholder="0.00"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const parsed = parseFloat(tempFloorSystemInput);
                        if (!isNaN(parsed) && parsed >= 0) {
                          setFloorSystemInput(String(parsed));
                          setIsEditingFloorSystem(false);
                        }
                      } else if (e.key === 'Escape') {
                        setIsEditingFloorSystem(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const parsed = parseFloat(tempFloorSystemInput);
                      if (!isNaN(parsed) && parsed >= 0) {
                        setFloorSystemInput(String(parsed));
                        setIsEditingFloorSystem(false);
                      }
                    }}
                    className="p-1.5 bg-[#009045] hover:bg-[#007a3a] text-white rounded-[6px] shadow-xs"
                    title="Confirmar cantidad teórica"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingFloorSystem(false)}
                    className="p-1.5 bg-[#E5E7EB] hover:bg-gray-300 text-[#1F2937] rounded-[6px]"
                    title="Cancelar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className={`w-full h-16 flex items-center justify-center bg-[#F8F9FA] border rounded-[8px] ${
                  apiFetchFailed ? 'border-[#F59E0B]/40' : 'border-[#E5E7EB]'
                }`}>
                  <span
                    className={`font-mono text-3xl font-black ${
                      isFetchingLive ? 'text-[#6B7280]' : 'text-[#1F2937]'
                    }`}
                  >
                    {isFetchingLive ? '...' : Number(floorSystemInput).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setSelectedDiscrepancy(null)}
              className="btn-collector bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] min-h-[52px] px-5 rounded-[8px] font-bold text-sm border border-[#E5E7EB]"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmReconciliation}
              disabled={!isFloorCountValid || isSubmitting || isFetchingLive}
              className="btn-collector flex-1 bg-[#009045] hover:bg-[#007a3a] disabled:opacity-50 text-white min-h-[52px] rounded-[8px] font-black flex items-center justify-center gap-2 transition active:scale-95 shadow-sm"
            >
              {isSubmitting ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}{' '}
              VALIDAR DESTINO
            </button>
          </div>
        </div>
      )}

      {/* LISTA DE PENDIENTES POR VERIFICAR EN DESTINO */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-black text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#263988]" />
            <span>Pendientes por Verificar ({filteredDiscrepancies.length})</span>
          </h3>
        </div>

        {filteredDiscrepancies.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-[#E5E7EB] rounded-[12px] p-10 text-center text-[#6B7280] space-y-2 card-elevation">
            <CheckCircle2 className="w-12 h-12 mx-auto text-[#009045]" />
            <p className="text-base font-bold text-[#1F2937]">No hay discrepancias pendientes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDiscrepancies.map((disc) => {
              const originDisc = Number(disc.originDiscrepancy || 0);
              const isFaltante = originDisc < 0;
              const isSelected = disc.discrepancyId === selectedDiscrepancy?.discrepancyId;
              const skuTrimmed = (disc.skuCode || '').trim();
              const matchingTask = tasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === skuTrimmed);
              const taskDesc = matchingTask?.SkuDescription || matchingTask?.skuDescription;
              const isDiscReal =
                disc.skuDescription &&
                disc.skuDescription.trim() !== skuTrimmed &&
                !/^\d{1,8}$/.test(disc.skuDescription.trim());
              const displayName =
                (taskDesc && taskDesc.trim() !== skuTrimmed ? taskDesc : null) ||
                (isDiscReal ? disc.skuDescription : null) ||
                'Artículo auditado';

              return (
                <div
                  key={disc.discrepancyId}
                  className={`bg-white border rounded-[12px] p-4 card-elevation transition ${
                    isSelected
                      ? 'border-2 border-[#263988]'
                      : 'border-[#E5E7EB]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-black text-[#263988] bg-blue-50 px-2.5 py-0.5 rounded-full border border-[#263988]/20">
                          SKU: {disc.skuCode}
                        </span>
                        <span className="text-[11px] font-semibold text-[#6B7280]">
                          Origen: <strong className="text-[#1F2937]">{formatDepositLabel(disc.originDeposit)}</strong> &rarr; Destino: <strong className="text-[#1F2937]">{formatDepositLabel(disc.targetDeposit)}</strong>
                        </span>
                      </div>
                      <h4 className="text-base sm:text-lg font-black text-[#1F2937] tracking-tight leading-tight">
                        {displayName}
                      </h4>
                    </div>

                    <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0">
                      <div className="bg-[#F8F9FA] border border-[#E5E7EB] px-3 py-2 rounded-[8px] text-right">
                        <span className="text-[10px] uppercase font-bold text-[#6B7280] block">
                          {isFaltante ? 'Faltante Origen' : 'Sobrante Origen'}
                        </span>
                        <span
                          className={`text-base font-mono font-black ${
                            isFaltante ? 'text-[#DC2626]' : 'text-[#263988]'
                          }`}
                        >
                          {originDisc > 0 ? `+${originDisc.toFixed(2)}` : originDisc.toFixed(2)} u
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setDiscrepancyToCancel(disc as FloorDiscrepancy)}
                          className="btn-collector bg-white hover:bg-red-50 text-[#6B7280] hover:text-[#DC2626] border border-[#E5E7EB] hover:border-red-200 min-h-[48px] px-3 rounded-[8px] flex items-center justify-center transition shadow-2xs"
                          title="Descartar / Cancelar discrepancia falsa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSelectDiscrepancy(disc as FloorDiscrepancy)}
                          className="btn-collector bg-[#009045] hover:bg-[#007a3a] text-white min-h-[48px] px-4 rounded-[8px] font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs"
                        >
                          <span>Verificar</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NUEVA TABLA: TRASLADOS SUGERIDOS PARA APROBACIÓN MANUAL */}
      <div className="space-y-3 pt-6 border-t border-[#E5E7EB]">
        <h3 className="text-xs font-black text-[#263988] uppercase tracking-widest flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4" /> TRASLADOS PENDIENTES DE CONFIRMACIÓN (
          {pendingSuggestedTransfers.length})
        </h3>

        {pendingSuggestedTransfers.length === 0 ? (
          <div className="p-6 bg-white border border-[#E5E7EB] rounded-[12px] text-center text-[#6B7280] text-sm card-elevation">
            No hay movimientos sugeridos esperando confirmación.
          </div>
        ) : (
          pendingSuggestedTransfers.map((tr: any) => {
            const trSku = (tr.SkuCode || tr.skuCode || '').trim();
            const matchingTask = tasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === trSku);
            const trName = matchingTask?.SkuDescription || matchingTask?.skuDescription || tr.SkuDescription || tr.skuDescription || 'Producto';

            return (
              <div
                key={tr.TransferId || tr.transferId}
                className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 card-elevation"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {trSku && (
                      <span className="text-xs font-mono font-black bg-[#263988]/10 text-[#263988] px-2.5 py-0.5 rounded-full border border-[#263988]/20">
                        SKU: {trSku}
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-amber-50 text-[#D97706] px-2 py-0.5 rounded-full border border-[#D97706]/20">
                      MOVIMIENTO SUGERIDO PARA CUADRAR
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-[#1F2937] mt-1.5 leading-tight">
                    {trName}
                  </h4>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-[#6B7280] font-mono font-bold">
                    <span>
                      Mover {tr.TransferQuantity || tr.TransferredQuantity || tr.transferredQuantity} u
                    </span>
                    <span className="bg-[#F8F9FA] px-2 py-0.5 rounded-[8px] border border-[#E5E7EB] text-[#1F2937]">
                      De: {formatDepositLabel(tr.FromDeposit || tr.OriginDeposit || tr.originDeposit)}
                    </span>
                    <ArrowRightLeft className="w-3 h-3 text-[#263988]" />
                    <span className="bg-[#F8F9FA] px-2 py-0.5 rounded-[8px] border border-[#E5E7EB] text-[#1F2937]">
                      A: {formatDepositLabel(tr.ToDeposit || tr.DestinationDeposit || tr.destinationDeposit)}
                    </span>
                  </div>
                </div>
              <button
                type="button"
                onClick={() => setTransferToConfirm(tr)}
                className="bg-[#263988] hover:bg-[#1d2c6b] text-white px-5 py-2.5 rounded-[8px] font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition shadow-xs w-full sm:w-auto shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" /> CONFIRMAR ERP
              </button>
            </div>
          );
        })
      )}
      </div>

      {/* MODAL ESTILIZADO: CANCELACIÓN / DESCARTE DE DISCREPANCIA FALSA */}
      {discrepancyToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[16px] max-w-md w-full p-5 sm:p-6 space-y-4 modal-elevation border border-[#E5E7EB]">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-full text-[#DC2626] shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#1F2937]">Descartar Discrepancia</h3>
                <p className="text-xs text-[#6B7280]">Marcar como CANCELADA en la base de datos</p>
              </div>
            </div>

            <div className="bg-[#F8F9FA] rounded-[8px] p-3 text-xs space-y-2 border border-[#E5E7EB]">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-[#263988] bg-blue-50 px-2 py-0.5 rounded-full border border-[#263988]/20">
                  SKU: {discrepancyToCancel.skuCode}
                </span>
                <span className="text-[11px] font-bold text-[#6B7280]">
                  {Number(discrepancyToCancel.originDiscrepancy || 0) < 0 ? 'Faltante: ' : 'Sobrante: '}
                  {Number(discrepancyToCancel.originDiscrepancy || 0).toFixed(2)} u
                </span>
              </div>
              <p className="font-bold text-[#1F2937] text-sm">
                {(() => {
                  const skuTrimmed = (discrepancyToCancel.skuCode || '').trim();
                  const matchingTask = tasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === skuTrimmed);
                  return matchingTask?.SkuDescription || matchingTask?.skuDescription || discrepancyToCancel.skuDescription || 'Artículo auditado';
                })()}
              </p>
              <div className="text-[11px] text-[#6B7280] space-y-0.5 pt-1 border-t border-[#E5E7EB]">
                <div>Origen: <strong>{formatDepositLabel(discrepancyToCancel.originDeposit)}</strong></div>
                <div>Destino: <strong>{formatDepositLabel(discrepancyToCancel.targetDeposit)}</strong></div>
              </div>
            </div>

            <p className="text-xs text-[#B45309] font-medium bg-amber-50 p-2.5 rounded-[8px] border border-amber-200">
              ¿Está seguro de descartar esta discrepancia? El registro pasará a estado <strong>CANCELADA</strong> y ya no se mostrará como pendiente para validar en piso.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDiscrepancyToCancel(null)}
                className="flex-1 min-h-[44px] bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] font-bold text-xs rounded-[8px] border border-[#E5E7EB] transition disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCancelDiscrepancy}
                className="flex-1 min-h-[44px] bg-[#DC2626] hover:bg-[#b91c1c] text-white font-black text-xs rounded-[8px] shadow-xs active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>Sí, descartar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ESTILIZADO: CONFIRMACIÓN DE TRASLADO EN EL ERP */}
      {transferToConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[16px] max-w-md w-full p-5 sm:p-6 space-y-4 modal-elevation border border-[#E5E7EB]">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#263988]/10 rounded-full text-[#263988] shrink-0">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#1F2937]">Confirmar Traslado en ERP</h3>
                <p className="text-xs text-[#6B7280]">Validación física y contable del movimiento</p>
              </div>
            </div>

            <div className="bg-[#F8F9FA] rounded-[8px] p-3 text-xs space-y-2 border border-[#E5E7EB]">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-[#263988] bg-blue-50 px-2 py-0.5 rounded-full border border-[#263988]/20">
                  SKU: {transferToConfirm.SkuCode || transferToConfirm.skuCode}
                </span>
                <span className="font-mono font-black text-sm text-[#009045] bg-emerald-50 px-2 py-0.5 rounded-full border border-[#009045]/20">
                  {transferToConfirm.TransferQuantity || transferToConfirm.TransferredQuantity || 0} u
                </span>
              </div>
              <p className="font-bold text-[#1F2937] text-sm">
                {(() => {
                  const trSku = (transferToConfirm.SkuCode || transferToConfirm.skuCode || '').trim();
                  const matchingTask = tasks.find((t) => (t.SkuCode || t.skuCode || '').trim() === trSku);
                  return matchingTask?.SkuDescription || matchingTask?.skuDescription || transferToConfirm.SkuDescription || transferToConfirm.skuDescription || 'Artículo';
                })()}
              </p>
              <div className="p-2.5 bg-white rounded-[6px] border border-[#E5E7EB] space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between text-[#6B7280]">
                  <span>Desde:</span>
                  <strong className="text-[#1F2937]">
                    {formatDepositLabel(transferToConfirm.FromDeposit || transferToConfirm.OriginDeposit || transferToConfirm.originDeposit)}
                  </strong>
                </div>
                <div className="flex items-center justify-between text-[#6B7280]">
                  <span>Hacia:</span>
                  <strong className="text-[#1F2937]">
                    {formatDepositLabel(transferToConfirm.ToDeposit || transferToConfirm.DestinationDeposit || transferToConfirm.destinationDeposit)}
                  </strong>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#4B5563] bg-blue-50/60 p-2.5 rounded-[8px] border border-[#263988]/20 leading-relaxed">
              ¿Confirma que este traslado físico entre depósitos ya fue ejecutado o cargado en el sistema ERP?
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setTransferToConfirm(null)}
                className="flex-1 min-h-[46px] bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] font-bold text-xs rounded-[8px] border border-[#E5E7EB] transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleExecuteTransferConfirm}
                className="flex-1 min-h-[46px] bg-[#009045] hover:bg-[#007a3a] text-white font-black text-xs rounded-[8px] shadow-xs active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>CONFIRMAR TRASLADO</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLOTANTE */}
      {toast && (
        <div
          className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-[12px] modal-elevation text-xs sm:text-sm font-bold flex items-center gap-2.5 max-w-md w-[90%] border bg-white text-[#1F2937] animate-slideUp ${
            toast.type === 'success'
              ? 'border-[#009045]'
              : toast.type === 'warning'
              ? 'border-[#F59E0B]'
              : 'border-[#DC2626]'
          }`}
        >
          {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#009045] shrink-0" />}
          {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />}
          {toast.type === 'error' && <X className="w-5 h-5 text-[#DC2626] shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};