/**
 * AUDITORIAPLUS+ - Tab 1/2: Colector de Conteo en Almacén (Depósito 150101)
 * Ergonomía táctil para terminales industriales (Honeywell, Zebra, Smartphones)
 * Mínimo 48px - 56px por botón, contraste extremo, modo offline garantizado.
 * Integración de Escáner Óptico de Cámara HTML5 con retícula verde y flash toggle.
 * FASE 1: Inyección de Estadísticas en Tiempo Real.
 * FASE 2: Interceptor de API Maraplus en Vivo y Flujo Bidireccional.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Wifi,
  WifiOff,
  X,
  Camera,
  CameraOff,
  Scan,
  Sparkles,
  RefreshCw,
  Edit2,
  Check,
  Clock,
  Lock,
  Unlock,
  User,
  ShieldAlert
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { useMissionStore } from '../store/useMissionStore';
import { useDiscrepancyStore } from '../stores/useDiscrepancyStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { enqueueOfflineEvent } from '../lib/db';
import { normalizeSku, FloorDiscrepancy } from '../types/audit';
import { useAuthStore } from '../stores/useAuthStore';
import { formatDepositLabel } from '../lib/deposits';
import {
  getAuditorName,
  getTaskAuditRecord,
  saveTaskAuditRecord,
  formatAuditDate,
  TaskAuditRecord
} from '../lib/auditLog';

interface TabCollectorProps {
  onNavigateToFloor?: () => void;
}

const VIEWPORT_ID = 'barcode-scanner-viewport';

export const TabCollector: React.FC<TabCollectorProps> = ({ onNavigateToFloor }) => {
  const isOnline = useOnlineStatus();
  const user = useAuthStore(state => state.user);

  // Stores
  const {
    activeMission,
    activeMissionId,
    activeTask,
    tasks,
    searchTerm,
    setSearchTerm,
    setActiveTaskBySku,
    updateTaskCountLocally,
    clearActiveTask,
  } = useMissionStore();

  const { addDiscrepancy } = useDiscrepancyStore();

  // Estados locales de conteo
  const [countedInput, setCountedInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Estados de control de auditoría previa y bloqueo
  const [auditLogInfo, setAuditLogInfo] = useState<TaskAuditRecord | null>(null);
  const [isLoadingAuditLog, setIsLoadingAuditLog] = useState<boolean>(false);
  const [isRecountAllowed, setIsRecountAllowed] = useState<boolean>(false);
  const [showRecountModal, setShowRecountModal] = useState<boolean>(false);

  const [toast, setToast] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error';
    discrepancyVal?: number;
  } | null>(null);

  // --- NUEVOS ESTADOS FASE 2: INTERCEPTOR EN VIVO ---
  const [isLiveFetching, setIsLiveFetching] = useState<boolean>(false);
  const [liveData, setLiveData] = useState<{ systemQty: number | null; targetQty: number | null; targetDeposit: string | null }>({
    systemQty: null,
    targetQty: null,
    targetDeposit: null
  });
  const [manualSystemQty, setManualSystemQty] = useState<number | null>(null);
  const [isEditingSystemQty, setIsEditingSystemQty] = useState<boolean>(false);
  const [tempSystemQtyInput, setTempSystemQtyInput] = useState<string>('');

  // Estados de escáner de cámara
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isCameraStarting, setIsCameraStarting] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [hasTorchCapability, setHasTorchCapability] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Referencias
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const countInputRef = useRef<HTMLInputElement>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');
  const scanDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // VARIABLES DE ESTADÍSTICAS EN VIVO
  const totalSkus = activeMission?.totalSkus || 0;
  const countedSkus = activeMission?.countedSkus || 0;
  const discrepantSkus = activeMission?.discrepantSkus || 0;
  const pendingSkus = activeMission?.pendingSkus || 0;
  const progressPct = totalSkus > 0 ? Math.round((countedSkus / totalSkus) * 100) : 0;

  useEffect(() => {
    scannerInputRef.current?.focus();
    return () => {
      if (scanDebounceTimerRef.current) {
        clearTimeout(scanDebounceTimerRef.current);
      }
    };
  }, []);

  const applyLpadNormalization = (raw: string): string => {
    const trimmed = (raw || '').trim();
    if (/^\d{1,6}$/.test(trimmed)) {
      return trimmed.padStart(6, '0');
    }
    return normalizeSku(trimmed);
  };

  const showToastBanner = useCallback(
    (text: string, type: 'success' | 'warning' | 'error', discrepancyVal?: number) => {
      setToast({ text, type, discrepancyVal });
      setTimeout(() => {
        setToast(null);
      }, 4500);
    },
    []
  );

  // --- LÓGICA INTERCEPTORA FASE 2: Modificada a ASYNC ---
  const processDetectedCode = useCallback(
    async (rawCode: string, origin: 'camera' | 'manual') => {
      if (!rawCode || !rawCode.trim()) return;
      const normalizedSku = applyLpadNormalization(rawCode);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(origin === 'camera' ? 100 : 40);
      }

      setSearchTerm(normalizedSku);
      const task = setActiveTaskBySku(normalizedSku);

      if (!task) {
        showToastBanner(`No se encontró el SKU o código "${normalizedSku}" en esta misión`, 'warning');
        scannerInputRef.current?.focus();
        scannerInputRef.current?.select();
      } else {
        // --- INICIO INTERCEPTOR EN VIVO (FASE 2) ---
        setIsLiveFetching(true);
        try {
          const res = await fetch(`https://192.168.15.225:3002/api/inventory?search=${normalizedSku}`);
          
          if (res.ok) {
            const json = await res.json();
            
            if (json.success && json.data) {
              // 1. Deducir Origen y Destino de forma agnóstica
              const originDep = task.DepositCode || task.depositCode || '150101';
              const targetDep = originDep === '150101' ? '150103' : '150101';
              
              // 2. Buscar las existencias físicas para ambos
              const originItem = json.data.find((d: any) => d.codigo_deposito === originDep);
              const targetItem = json.data.find((d: any) => d.codigo_deposito === targetDep);
              const liveOriginStock = originItem ? Number(originItem.stock_quantity) : 0;

              // 3. Inyectar datos frescos en el estado
              setLiveData({
                systemQty: liveOriginStock,
                targetQty: targetItem ? Number(targetItem.stock_quantity) : 0,
                targetDeposit: targetDep
              });

              // Si el SKU no tiene conteo registrado previo, pre-escribir la cantidad del ERP
              if (task.CountedQuantity === null || task.CountedQuantity === undefined) {
                setCountedInput(String(liveOriginStock));
              }
              
              showToastBanner(`SKU ${task.SkuCode || task.skuCode} escaneado. Stock ERP actualizado en vivo.`, 'success');
            }
          }
        } catch (err) {
          console.warn('[Interceptor] Fallo al consultar API', err);
          showToastBanner(`SKU ${task.SkuCode || task.skuCode} cargado. Sin conexión ERP, usando stock almacenado.`, 'warning');
        } finally {
          setIsLiveFetching(false);
        }
        // --- FIN INTERCEPTOR ---
      }
    },
    [setActiveTaskBySku, setSearchTerm, showToastBanner]
  );

  const stopCameraScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (err) {
        console.warn('[TabCollector] Limpieza de cámara:', err);
      }
      html5QrCodeRef.current = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
    setIsCameraStarting(false);
  }, []);

  const startCameraScanner = useCallback(async () => {
    setCameraError(null);
    try {
      await stopCameraScanner();
      setIsCameraStarting(true);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const qrScanner = new Html5Qrcode(VIEWPORT_ID, false);
      html5QrCodeRef.current = qrScanner;

      await qrScanner.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdgePercentage = 0.78;
            const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
            const boxSize = Math.floor(minEdgeSize * minEdgePercentage);
            return {
              width: Math.min(300, viewfinderWidth - 24),
              height: Math.min(180, Math.floor(boxSize * 0.7)),
            };
          },
          aspectRatio: 1.777778,
        },
        (decodedText: string) => {
          const now = Date.now();
          if (now - lastScanTimeRef.current < 1200 && lastScannedCodeRef.current === decodedText) {
            return;
          }
          lastScanTimeRef.current = now;
          lastScannedCodeRef.current = decodedText;
          // Automáticamente ocultar y minimizar la cámara al leer un código
          stopCameraScanner();
          processDetectedCode(decodedText, 'camera');
        },
        (_error) => {}
      );

      setIsCameraActive(true);
      try {
        const capabilities = qrScanner.getRunningTrackCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setHasTorchCapability(true);
        } else {
          setHasTorchCapability(false);
        }
      } catch {
        setHasTorchCapability(false);
      }
    } catch (err: unknown) {
      console.warn('[TabCollector] Fallo al iniciar visor de cámara:', err);
      const errMsg = err instanceof Error ? err.message : 'No se pudo acceder a la cámara. Verifique los permisos del navegador.';
      setCameraError(errMsg);
      setIsCameraActive(false);
      showToastBanner('No fue posible abrir la cámara. Use el input manual.', 'warning');
    } finally {
      setIsCameraStarting(false);
    }
  }, [processDetectedCode, showToastBanner, stopCameraScanner]);

  const toggleFlashTorch = async () => {
    if (!html5QrCodeRef.current || !isCameraActive) return;
    try {
      const nextState = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        // @ts-expect-error torch is valid
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('[TabCollector] Error al alternar linterna:', err);
      showToastBanner('El flash no está soportado en este dispositivo', 'warning');
    }
  };

  const toggleCamera = () => {
    if (isCameraActive || isCameraStarting) {
      stopCameraScanner();
    } else {
      startCameraScanner();
    }
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop().catch(() => {});
          }
          html5QrCodeRef.current.clear();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (activeTask) {
      const existingCount = activeTask.CountedQuantity !== null && activeTask.CountedQuantity !== undefined
        ? String(activeTask.CountedQuantity)
        : activeTask.countedQuantity !== null && activeTask.countedQuantity !== undefined
        ? String(activeTask.countedQuantity)
        : '';

      const isCounted = activeTask.CountedQuantity !== null && activeTask.CountedQuantity !== undefined;
      const initialCount = isCounted
        ? existingCount
        : String(Number(activeTask.SystemQuantity ?? activeTask.systemQuantity ?? 0));

      setCountedInput(initialCount);
      setManualSystemQty(null);
      setIsEditingSystemQty(false);
      setTempSystemQtyInput('');
      setShowRecountModal(false);

      if (isCounted) {
        setIsRecountAllowed(false);
        setIsLoadingAuditLog(true);
        const taskId = activeTask.TaskId || activeTask.taskId || '';
        const sku = activeTask.SkuCode || activeTask.skuCode || '';
        const timestamp = activeTask.UpdatedAt || activeTask.updatedAt || activeTask.CreatedAt || '';

        getTaskAuditRecord(taskId, sku, timestamp)
          .then((rec) => {
            setAuditLogInfo(rec);
          })
          .catch(() => {
            setAuditLogInfo({
              auditorName: activeTask.lastAuditorName || activeTask.LastAuditorName || 'Auditor Asignado',
              countedAt: timestamp || new Date().toISOString()
            });
          })
          .finally(() => {
            setIsLoadingAuditLog(false);
          });
      } else {
        setIsRecountAllowed(true);
        setAuditLogInfo(null);
        setTimeout(() => {
          countInputRef.current?.focus();
          countInputRef.current?.select();
        }, 50);
      }
    } else {
      setCountedInput('');
      setManualSystemQty(null);
      setIsEditingSystemQty(false);
      setTempSystemQtyInput('');
      setIsRecountAllowed(false);
      setShowRecountModal(false);
      setAuditLogInfo(null);
      // Reset de datos en vivo al limpiar la tarea
      setLiveData({ systemQty: null, targetQty: null, targetDeposit: null });
    }
  }, [activeTask]);

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanDebounceTimerRef.current) {
      clearTimeout(scanDebounceTimerRef.current);
    }
    if (searchTerm.trim()) {
      processDetectedCode(searchTerm.trim(), 'manual');
    }
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);

    if (scanDebounceTimerRef.current) {
      clearTimeout(scanDebounceTimerRef.current);
    }

    const trimmed = val.trim();
    // Detección automática en colectores Android y escaneo continuo
    if (trimmed.length >= 3) {
      scanDebounceTimerRef.current = setTimeout(() => {
        const currentActiveSku = (activeTask?.SkuCode || activeTask?.skuCode || '').trim();
        const normalized = applyLpadNormalization(trimmed);
        if (currentActiveSku !== normalized && currentActiveSku !== trimmed) {
          processDetectedCode(trimmed, 'manual');
        }
      }, 280);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanDebounceTimerRef.current) {
        clearTimeout(scanDebounceTimerRef.current);
      }
      if (searchTerm.trim()) {
        processDetectedCode(searchTerm.trim(), 'manual');
      }
    }
  };

  const adjustCount = (delta: number) => {
    const current = parseFloat(countedInput) || 0;
    const nextVal = Math.max(0, current + delta);
    setCountedInput(String(nextVal));
  };

  // --- CÁLCULO TEÓRICO (Prioridad al dato del ERP en vivo o ajuste manual) ---
  const baseSystemQty = Number(activeTask?.SystemQuantity ?? activeTask?.systemQuantity ?? 0);
  const finalSystemQty = manualSystemQty !== null ? manualSystemQty : (liveData.systemQty !== null ? liveData.systemQty : baseSystemQty);
  const salesQty = 0; // Se elimina el sistema de ventas por requerimiento de negocio
  const adjustedTheoretical = finalSystemQty;
  const countedQty = parseFloat(countedInput);
  const isCountValid = !isNaN(countedQty) && countedQty >= 0;
  const liveDiscrepancy = isCountValid ? countedQty - adjustedTheoretical : 0;
  const isExactMatch = isCountValid && liveDiscrepancy === 0;
  const isAlreadyCounted = Boolean(activeTask && activeTask.CountedQuantity !== null && activeTask.CountedQuantity !== undefined);

  // NUEVO FLUJO CQRS: Registro y Actualización Dinámica de Stock en Supabase
  const handleRegisterCount = async () => {
    if (!activeTask) return;
    
    // Validamos Sesión
    if (!user) {
      showToastBanner('Error: Sesión expirada o no válida. Vuelve a iniciar sesión.', 'error');
      return;
    }

    if (!isCountValid) {
      showToastBanner('Ingrese una cantidad válida mayor o igual a cero', 'error');
      countInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    const discrepancy = Number(liveDiscrepancy.toFixed(2));
    const taskStatus = discrepancy === 0 ? 'COMPLETED_MATCH' : 'DISCREPANT';
    const skuCodeToUse = activeTask.SkuCode || activeTask.skuCode || '';
    const missionIdToUse = activeMissionId || activeTask.MissionId || activeTask.missionId || '';
    const taskIdToUse = activeTask.TaskId || activeTask.taskId || '';
    const skuDescToUse = activeTask.SkuDescription || activeTask.skuDescription || '';

    // Variables Bidireccionales extraídas del Interceptor o de la Tarea Original
    const originDeposit = activeTask.DepositCode || activeTask.depositCode || '150101';
    const targetDeposit = liveData.targetDeposit || (originDeposit === '150101' ? '150103' : '150101');
    const targetSysQty = liveData.targetQty || 0;

    const auditorName = getAuditorName(user);
    const nowIso = new Date().toISOString();

    // 0. Guardar auditor en la caché local para lectura instantánea futura
    saveTaskAuditRecord(taskIdToUse, skuCodeToUse, auditorName, nowIso);

    // 1. Actualización optimista local en memoria (Feedback Instantáneo al Operador)
    updateTaskCountLocally(skuCodeToUse, countedQty, 0, discrepancy, taskStatus, finalSystemQty, auditorName);

    // 2. Si se detecta discrepancia, registrar en cola local de destino (Agnóstico)
    const discItem: FloorDiscrepancy = {
      discrepancyId: crypto.randomUUID ? crypto.randomUUID() : `disc_${Date.now()}`,
      taskId: taskIdToUse as any,
      missionId: missionIdToUse,
      skuCode: skuCodeToUse,
      skuDescription: skuDescToUse,
      originDiscrepancy: discrepancy,
      originDeposit: originDeposit as any,
      targetDeposit: targetDeposit as any,
      targetSystemQuantity: targetSysQty,
      targetCountedQuantity: null,
      targetDiscrepancy: null,
      status: 'PENDING_TARGET_COUNT',
    };

    if (discrepancy !== 0) {
      addDiscrepancy(discItem as any);
    }

    // 3. Payload oficial integrando la info del destino para la Edge Function
    const payload = {
      mission_id: missionIdToUse,
      task_id: taskIdToUse,
      deposit_code: originDeposit,
      sku_code: skuCodeToUse,
      counted_quantity: countedQty,
      system_quantity: finalSystemQty, // ¡Este es el real en vivo que actualiza la base de datos!
      sales_during_audit: 0,
      user_id: user.id,
      target_deposit: targetDeposit,
      target_system_quantity: targetSysQty
    };

    // 4. Estrategia de Envío asíncrono y Actualización en Supabase
    try {
      if (isOnline && isSupabaseConfigured) {
        // Actualizamos explícitamente en la base de datos de Supabase la nueva cantidad de sistema
        const { error: dbUpdateErr } = await supabase
          .from('Read_Mission_Tasks')
          .update({
            SystemQuantity: finalSystemQty,
            CountedQuantity: countedQty,
            SalesDuringAudit: 0,
            Discrepancy: discrepancy,
            Status: taskStatus,
            UpdatedAt: nowIso
          })
          .eq('TaskId', taskIdToUse);

        if (dbUpdateErr) {
          console.warn('[TabCollector] Error actualizando Read_Mission_Tasks en Supabase:', dbUpdateErr);
        }

        // Insertar en EventStore cumpliendo arquitectura CQRS estricta (/docs/estructura_supabase_actualizada.ts)
        const generateUUID = () => {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        };

        const { error: eventError } = await supabase.from('EventStore').insert({
          EventId: generateUUID(),
          EventType: 'PhysicalCountRegistered',
          AggregateId: taskIdToUse,
          AggregateType: 'MissionTask',
          UserId: user.id,
          CorrelationId: generateUUID(),
          Payload: payload,
          Metadata: {
            auditor_name: auditorName,
            sku_code: skuCodeToUse,
            counted_quantity: countedQty,
            system_quantity: finalSystemQty,
            discrepancy
          },
          SequenceNum: 1,
          Timestamp: nowIso,
          Version: 1
        });

        if (eventError) {
          console.warn('[TabCollector] Advertencia al registrar en EventStore:', eventError);
        }

        // Si se generó discrepancia, persistir en Read_Floor_Discrepancies con SkuDescription real
        if (discrepancy !== 0) {
          await supabase.from('Read_Floor_Discrepancies').upsert({
            DiscrepancyId: discItem.discrepancyId,
            MissionId: missionIdToUse,
            OriginDeposit: originDeposit,
            OriginDiscrepancy: discrepancy,
            SkuCode: skuCodeToUse,
            SkuDescription: skuDescToUse,
            Status: 'PENDING_TARGET_COUNT',
            TargetDeposit: targetDeposit,
            TargetSystemQuantity: targetSysQty,
            UpdatedAt: nowIso
          });
        } else {
          // Si el re-conteo concilia el stock a 0 diferencia, cancelar discrepancia pendiente en piso
          await supabase
            .from('Read_Floor_Discrepancies')
            .update({
              Status: 'CANCELADA',
              ResolvedAt: nowIso,
              UpdatedAt: nowIso
            })
            .eq('MissionId', missionIdToUse)
            .eq('SkuCode', skuCodeToUse)
            .or('Status.eq.OPEN,Status.eq.PENDING_TARGET_COUNT,Status.eq.PENDING_FLOOR_COUNT');

          // Registrar evento explícito en EventStore
          await supabase.from('EventStore').insert({
            EventId: generateUUID(),
            EventType: 'DiscrepancyCancelled',
            AggregateId: taskIdToUse,
            AggregateType: 'FloorDiscrepancy',
            UserId: user.id,
            CorrelationId: generateUUID(),
            Payload: {
              sku_code: skuCodeToUse,
              mission_id: missionIdToUse,
              reason: 'RECOUNT_CONCILIATED_ZERO_DISCREPANCY',
              counted_quantity: countedQty,
              system_quantity: finalSystemQty
            },
            Metadata: {
              source: 'TabCollector',
              auditor_name: auditorName
            },
            SequenceNum: 1,
            Timestamp: nowIso,
            Version: 1
          });

          // Actualizar store local de discrepancias reactivamente
          const currentPending = useDiscrepancyStore.getState().pendingFloorDiscrepancies || [];
          const remaining = currentPending.filter((d) => (d.skuCode || '').trim() !== skuCodeToUse.trim());
          useDiscrepancyStore.setState({ pendingFloorDiscrepancies: remaining });
        }

        // Invocamos la Edge Function de Supabase
        const { error: fnErr } = await supabase.functions.invoke('register-count', {
          body: payload,
        });

        if (fnErr) {
          console.warn('[TabCollector] Edge Function retornó advertencia:', fnErr);
        }
      } else {
        await enqueueOfflineEvent({
          type: 'register-count',
          missionId: missionIdToUse,
          taskId: taskIdToUse,
          payload,
        });
      }
    } catch (err) {
      console.warn('[TabCollector] Error de red al registrar conteo, encolando offline:', err);
      await enqueueOfflineEvent({
        type: 'register-count',
        missionId: missionIdToUse,
        taskId: taskIdToUse,
        payload,
      });
    } finally {
      setIsSubmitting(false);

      if (discrepancy === 0) {
        showToastBanner(`Conteo exacto registrado (${countedQty} u)`, 'success');
      } else {
        showToastBanner(
          `Discrepancia detectada (${discrepancy > 0 ? `+${discrepancy}` : discrepancy} u). Pasó a validación en ${formatDepositLabel(targetDeposit)}`,
          'warning',
          discrepancy
        );
      }

      clearActiveTask();
      setCountedInput('');
      setSearchTerm('');
      setManualSystemQty(null);
      setIsEditingSystemQty(false);
      setTempSystemQtyInput('');
      setIsRecountAllowed(false);
      setShowRecountModal(false);
      setAuditLogInfo(null);
      setTimeout(() => {
        scannerInputRef.current?.focus();
      }, 50);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto w-full">
      {/* 1. VIEWPORT DE CÁMARA Y ENTRADA HÍBRIDA */}
      <div className="bg-white border border-[#E5E7EB] focus-within:border-[#009045] rounded-[12px] p-3 sm:p-4 card-elevation transition space-y-3">
        {/* Cabecera de Escáner y Conectividad */}
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-black text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
            <Barcode className="w-5 h-5 text-[#263988]" />
            <span>Escaneo Híbrido: Cámara Trasera & Entrada SKU</span>
          </label>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="flex items-center gap-1 text-[#009045] text-[11px] font-semibold">
                <Wifi className="w-3.5 h-3.5" /> En línea
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[#F59E0B] text-[11px] font-semibold">
                <WifiOff className="w-3.5 h-3.5" /> Modo Offline
              </span>
            )}

            {/* Botón para Abrir / Cerrar Cámara */}
            <button
              type="button"
              onClick={toggleCamera}
              disabled={isCameraStarting}
              className={`min-h-[38px] px-3 rounded-[8px] text-xs font-bold flex items-center gap-1.5 transition active:scale-95 ${
                isCameraActive
                  ? 'bg-[#DC2626] hover:bg-[#b91c1c] text-white'
                  : 'bg-[#009045] hover:bg-[#007a3a] text-white'
              }`}
            >
              {isCameraActive ? (
                <>
                  <CameraOff className="w-4 h-4" />
                  <span className="hidden sm:inline">Cerrar Cámara</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>{isCameraStarting ? 'Iniciando...' : 'Abrir Cámara'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Viewport Centrado de Cámara con Retícula Verde y Flash Toggle */}
        <div
          className={`relative overflow-hidden rounded-[12px] bg-black border-2 transition-all ${
            isCameraActive || isCameraStarting
              ? 'block border-[#009045] shadow-lg'
              : 'hidden border-[#E5E7EB]'
          }`}
        >
          {/* Contenedor del elemento de video montado por html5-qrcode */}
          <div
            id={VIEWPORT_ID}
            className="w-full max-h-[320px] mx-auto bg-black flex items-center justify-center min-h-[220px]"
          />

          {/* Retícula Verde Indicadora de Escaneo */}
          {isCameraActive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
              <div className="relative w-64 sm:w-72 h-36 sm:h-44 border-2 border-[#009045] rounded-[12px] shadow-[0_0_15px_rgba(0,144,69,0.5)]">
                {/* Esquinas Reforzadas de Retícula Verde */}
                <span className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-[#009045]" />
                <span className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-[#009045]" />
                <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-[#009045]" />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-[#009045]" />

                {/* Línea Láser Animada de Escaneo */}
                <div className="w-full h-0.5 bg-[#009045] shadow-[0_0_8px_#009045] absolute top-1/2 -translate-y-1/2 animate-pulse" />

                <div className="absolute bottom-2 inset-x-0 text-center">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#009045] bg-black/70 px-2 py-0.5 rounded-[8px]">
                    Centrar Código de Barras
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Barra de Control Superpuesta en Cámara (Flash Toggle & Cerrar) */}
          {isCameraActive && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 z-10">
              <button
                type="button"
                onClick={toggleFlashTorch}
                title="Alternar Linterna / Flash"
                className={`p-2.5 rounded-[8px] font-bold text-xs backdrop-blur-md transition shadow-md ${
                  isTorchOn
                    ? 'bg-[#F59E0B] text-[#1F2937] ring-2 ring-amber-300'
                    : 'bg-black/60 hover:bg-black/80 text-white'
                }`}
              >
                <Zap className={`w-4 h-4 ${isTorchOn ? 'fill-current' : ''}`} />
              </button>

              <button
                type="button"
                onClick={stopCameraScanner}
                title="Cerrar visor"
                className="p-2.5 rounded-[8px] bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Indicador de Ayuda del Escáner */}
          {isCameraActive && (
            <div className="bg-[#1F2937]/90 py-1.5 px-3 text-center border-t border-[#1F2937] text-white">
              <p className="text-[11px] text-white/90 flex items-center justify-center gap-1.5">
                <Scan className="w-3.5 h-3.5 text-[#009045]" />
                Enfoque el código de barras 1D (EAN/UPC) o QR. Se aplicará regla LPAD (6 dígitos).
              </p>
            </div>
          )}
        </div>

        {/* Mensaje de Error en Cámara si ocurre */}
        {cameraError && (
          <div className="p-3 bg-red-50 border border-[#DC2626] rounded-[8px] text-xs text-[#DC2626] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* PANEL DE ESTADÍSTICAS EN TIEMPO REAL */}
        {totalSkus > 0 && (
          <div className="bg-[#F8F9FA] p-3 sm:p-4 rounded-[12px] border border-[#E5E7EB] space-y-2.5 my-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-black text-[#1F2937] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#009045]" />
                Progreso del Conteo
              </span>
              <span className="text-xs sm:text-sm font-mono font-black text-[#009045]">
                {countedSkus} / {totalSkus} SKUs ({progressPct}%)
              </span>
            </div>

            {/* Barra Visual de Progreso */}
            <div className="w-full bg-[#E5E7EB] h-2 sm:h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-[#009045] h-full transition-all duration-500 rounded-full"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            {/* Cuadrícula de Métricas de Alto Contraste */}
            <div className="grid grid-cols-4 gap-2 pt-1 text-center">
              <div className="bg-white p-2 rounded-[8px] border border-[#E5E7EB] card-elevation flex flex-col justify-center">
                <span className="block text-[9px] sm:text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Total</span>
                <span className="block text-base sm:text-lg font-mono font-black text-[#1F2937]">{totalSkus}</span>
              </div>
              <div className="bg-[#009045]/10 p-2 rounded-[8px] border border-[#009045]/20 flex flex-col justify-center">
                <span className="block text-[9px] sm:text-[10px] font-bold text-[#009045] uppercase tracking-wider">Contados</span>
                <span className="block text-base sm:text-lg font-mono font-black text-[#009045]">{countedSkus}</span>
              </div>
              <div className="bg-[#F59E0B]/10 p-2 rounded-[8px] border border-[#F59E0B]/20 flex flex-col justify-center">
                <span className="block text-[9px] sm:text-[10px] font-bold text-[#F59E0B] uppercase tracking-wider">Discrep.</span>
                <span className="block text-base sm:text-lg font-mono font-black text-[#F59E0B]">{discrepantSkus}</span>
              </div>
              <div className="bg-white p-2 rounded-[8px] border border-[#E5E7EB] card-elevation flex flex-col justify-center">
                <span className="block text-[9px] sm:text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">Faltan</span>
                <span className="block text-base sm:text-lg font-mono font-black text-[#1F2937]">{pendingSkus}</span>
              </div>
            </div>
          </div>
        )}

        {/* INPUT HÍBRIDO PERMANENTE */}
        <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={scannerInputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoFocus
              value={searchTerm}
              onChange={handleSearchInputChange}
              onKeyDown={handleSearchKeyDown}
              placeholder="Escanear o ingresar SKU manual..."
              className="w-full h-14 pl-11 pr-10 bg-white border-2 border-[#E5E7EB] focus:border-[#009045] rounded-[8px] text-[#1F2937] font-mono text-lg font-bold placeholder:text-[#6B7280] focus:outline-hidden"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  scannerInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#6B7280] hover:text-[#1F2937]"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="btn-collector bg-[#009045] hover:bg-[#007a3a] text-white min-h-[56px] min-w-[56px] px-5 sm:px-6 rounded-[8px] font-bold flex items-center gap-2 shadow-xs active:scale-95 transition"
          >
            <Search className="w-5 h-5" />
            <span className="hidden sm:inline">Buscar</span>
          </button>
        </form>

        {/* Guía Visual Dinámica de Normalización LPAD (6 Dígitos) */}
        {searchTerm && /^\d{1,5}$/.test(searchTerm.trim()) && (
          <p className="text-xs font-mono text-[#009045] flex items-center gap-1.5 pl-1">
            <Zap className="w-3.5 h-3.5 text-[#009045]" />
            Normalización LPAD: <strong>"{searchTerm.trim()}"</strong> &rarr;{' '}
            <strong className="underline font-bold text-[#1F2937]">
              {applyLpadNormalization(searchTerm)}
            </strong>
          </p>
        )}
      </div>

      {/* 2. FORMULARIO TÁCTIL DE CONTEO */}
      {activeTask ? (
        <div className="bg-white border-2 border-[#263988] rounded-[12px] p-4 sm:p-6 card-elevation space-y-5 animate-fadeIn">
          {/* Cabecera del Artículo */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-[#E5E7EB]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono font-black bg-[#263988]/10 text-[#263988] px-3 py-1 rounded-full border border-[#263988]/20">
                  SKU: {activeTask.SkuCode || activeTask.skuCode}
                </span>
                <span className="text-xs font-semibold text-[#6B7280]">
                  Origen: {formatDepositLabel(activeTask.DepositCode || activeTask.depositCode || '150101')}
                </span>
                {liveData.targetDeposit && (
                  <span className="text-xs font-semibold text-[#F59E0B]">
                    Destino: {formatDepositLabel(liveData.targetDeposit)}
                  </span>
                )}
                <span className="text-xs font-semibold text-[#009045]">
                  Costo: ${Number(activeTask.Cost || activeTask.cost || 0).toFixed(2)}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-[#1F2937] mt-1.5 tracking-tight">
                {activeTask.SkuDescription || activeTask.skuDescription}
              </h2>

              {/* Lista de Códigos de Barra asociados */}
              {(activeTask.Barcodes || activeTask.barcodes) && (activeTask.Barcodes || activeTask.barcodes).length > 0 && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] text-[#6B7280] font-semibold uppercase">EAN/UPC:</span>
                  {(activeTask.Barcodes || activeTask.barcodes).map((bc: string, idx: number) => (
                    <span
                      key={idx}
                      className="text-xs font-mono bg-[#F8F9FA] text-[#1F2937] px-2 py-0.5 rounded-full border border-[#E5E7EB]"
                    >
                      {bc}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={clearActiveTask}
              className="self-start sm:self-auto p-2 bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] rounded-[8px] text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <X className="w-4 h-4" />
              <span>Cerrar</span>
            </button>
          </div>

          {/* CASO 1: PRODUCTO YA CONTADO Y BLOQUEADO (TARJETA FIJA DE ADVERTENCIA) */}
          {isAlreadyCounted && !isRecountAllowed ? (
            <div className="bg-amber-50 border-2 border-[#F59E0B] rounded-[12px] p-4 sm:p-5 card-elevation space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-amber-100 text-[#D97706] rounded-[8px] shrink-0 mt-0.5">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-black text-[#92400E] uppercase tracking-wide">
                        PRODUCTO YA CONTADO EN ORIGEN
                      </h3>
                      <span className="text-[10px] font-bold uppercase bg-amber-200 text-[#78350F] px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Bloqueado
                      </span>
                    </div>
                    <p className="text-xs text-[#B45309] font-medium mt-1">
                      Este producto ya fue registrado en la auditoría. Para prevenir duplicados involuntarios, el registro se encuentra bloqueado.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cuadro de Auditor y Fecha */}
              <div className="bg-white/95 border border-amber-200 rounded-[8px] p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-[#263988] rounded-[6px]">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#6B7280] block">Auditado por</span>
                    <span className="font-bold text-[#1F2937] text-sm">
                      {isLoadingAuditLog ? (
                        <span className="inline-flex items-center gap-1 text-[#6B7280]">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Verificando auditor...
                        </span>
                      ) : (
                        auditLogInfo?.auditorName || activeTask.lastAuditorName || activeTask.LastAuditorName || 'Auditor Registrado'
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-[#009045] rounded-[6px]">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#6B7280] block">Fecha y Hora de Conteo</span>
                    <span className="font-bold text-[#1F2937] text-xs sm:text-sm font-mono">
                      {formatAuditDate(auditLogInfo?.countedAt || activeTask.UpdatedAt || activeTask.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cuadro de Cantidades Registradas */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 bg-white rounded-[8px] border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-[#6B7280] block">Sistema (S)</span>
                  <span className="text-base sm:text-lg font-black font-mono text-[#1F2937] mt-0.5 block">
                    {Number(activeTask.SystemQuantity ?? activeTask.systemQuantity ?? 0).toFixed(2)}
                  </span>
                  <span className="text-[9px] text-[#6B7280]">Existencia ERP</span>
                </div>
                <div className="p-2.5 bg-white rounded-[8px] border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-[#6B7280] block">Contado (Qc)</span>
                  <span className="text-base sm:text-lg font-black font-mono text-[#263988] mt-0.5 block">
                    {Number(activeTask.CountedQuantity ?? activeTask.countedQuantity ?? 0).toFixed(2)}
                  </span>
                  <span className="text-[9px] text-[#263988] font-semibold">Físico registrado</span>
                </div>
                <div className="p-2.5 bg-white rounded-[8px] border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-[#6B7280] block">Diferencia</span>
                  <span
                    className={`text-base sm:text-lg font-black font-mono mt-0.5 block ${
                      Number(activeTask.Discrepancy ?? 0) === 0
                        ? 'text-[#009045]'
                        : Number(activeTask.Discrepancy ?? 0) < 0
                        ? 'text-[#DC2626]'
                        : 'text-[#F59E0B]'
                    }`}
                  >
                    {Number(activeTask.Discrepancy ?? 0) > 0
                      ? `+${Number(activeTask.Discrepancy ?? 0).toFixed(2)}`
                      : Number(activeTask.Discrepancy ?? 0).toFixed(2)}
                  </span>
                  <span className="text-[9px] text-[#6B7280]">
                    {Number(activeTask.Discrepancy ?? 0) === 0
                      ? 'Cuadrado'
                      : Number(activeTask.Discrepancy ?? 0) < 0
                      ? 'Faltante'
                      : 'Sobrante'}
                  </span>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRecountModal(true)}
                  className="flex-1 btn-collector bg-[#F59E0B] hover:bg-[#D97706] text-white min-h-[46px] px-4 rounded-[8px] font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-xs"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>VOLVER A CONTAR (RE-AUDITORÍA)</span>
                </button>
                <button
                  type="button"
                  onClick={clearActiveTask}
                  className="btn-collector bg-white hover:bg-gray-100 text-[#1F2937] border border-[#E5E7EB] min-h-[46px] px-4 rounded-[8px] font-bold text-xs sm:text-sm transition"
                >
                  <span>Cerrar / Seleccionar otro SKU</span>
                </button>
              </div>
            </div>
          ) : (
            /* CASO 2: FORMULARIO DE CONTEO HABILITADO */
            <>
              {/* Banner de Modo Re-auditoría si se desbloqueó */}
              {isAlreadyCounted && isRecountAllowed && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-[8px] flex items-center justify-between text-xs text-[#92400E]">
                  <div className="flex items-center gap-2">
                    <Unlock className="w-4 h-4 text-[#D97706]" />
                    <span className="font-bold">Modo Re-auditoría Habilitado: Actualizando conteo anterior</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRecountAllowed(false)}
                    className="text-[11px] font-bold text-[#DC2626] hover:underline flex items-center gap-1"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Bloquear</span>
                  </button>
                </div>
              )}

              {/* Tarjeta de Existencia en Sistema (S) con ajuste asistido si la API falla */}
              <div className="bg-[#F8F9FA] p-3 sm:p-4 rounded-[8px] border border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-center sm:text-left">
                {isEditingSystemQty ? (
                  <div className="p-3 bg-white rounded-[8px] border-2 border-[#263988] shadow-xs flex-1">
                    <span className="text-xs text-[#263988] uppercase font-black block tracking-wider">
                      Ajustar Cantidad de Sistema (S)
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={tempSystemQtyInput}
                        onChange={(e) => setTempSystemQtyInput(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-center sm:text-left text-lg font-black font-mono border border-[#263988] rounded-[6px] focus:outline-hidden"
                        autoFocus
                        placeholder="0.00"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const parsed = parseFloat(tempSystemQtyInput);
                            if (!isNaN(parsed) && parsed >= 0) {
                              setManualSystemQty(parsed);
                              setIsEditingSystemQty(false);
                            }
                          } else if (e.key === 'Escape') {
                            setIsEditingSystemQty(false);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = parseFloat(tempSystemQtyInput);
                          if (!isNaN(parsed) && parsed >= 0) {
                            setManualSystemQty(parsed);
                            setIsEditingSystemQty(false);
                          }
                        }}
                        className="px-3 py-2 bg-[#009045] text-white rounded-[6px] hover:bg-[#007a3a] font-bold text-xs"
                        title="Confirmar ajuste de sistema"
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingSystemQty(false)}
                        className="px-3 py-2 bg-[#E5E7EB] text-[#1F2937] rounded-[6px] hover:bg-gray-300 font-bold text-xs"
                        title="Cancelar"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[#6B7280] uppercase font-black tracking-wider flex items-center gap-1">
                          Existencia en Sistema (S)
                        </span>
                        {isLiveFetching && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#263988]" />}
                        <button
                          type="button"
                          onClick={() => {
                            setTempSystemQtyInput(String(finalSystemQty));
                            setIsEditingSystemQty(true);
                          }}
                          className="p-1 text-[#6B7280] hover:text-[#263988] bg-white border border-[#E5E7EB] rounded-[6px] transition flex items-center gap-1 text-[11px] font-bold ml-1"
                          title="Modificar cantidad existente en sistema"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar</span>
                        </button>
                      </div>
                      <span className="text-[11px] font-bold block mt-0.5">
                        {isLiveFetching ? (
                          <span className="text-[#263988]">Consultando API ERP en vivo...</span>
                        ) : manualSystemQty !== null ? (
                          <span className="text-[#263988] bg-blue-50 px-2 py-0.5 rounded-full border border-[#263988]/20">Modificado manualmente</span>
                        ) : liveData.systemQty !== null ? (
                          <span className="text-[#009045] bg-emerald-50 px-2 py-0.5 rounded-full border border-[#009045]/20">Dato en vivo ERP</span>
                        ) : (
                          <span className="text-[#6B7280]">Dato almacenado en misión</span>
                        )}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl sm:text-3xl font-black font-mono block ${isLiveFetching ? 'text-[#6B7280]' : 'text-[#1F2937]'}`}>
                        {finalSystemQty.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-[#6B7280] uppercase font-bold">Unidades teóricas</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Campo Numérico Gigante para "Cantidad Contada Físicamente" */}
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-black text-[#1F2937] uppercase tracking-wider flex items-center justify-between">
                  <span>CANTIDAD CONTADA FÍSICAMENTE (Qc)</span>
                  <span className="text-xs text-[#009045] font-bold">Campo obligatorio</span>
                </label>

                <div className="relative">
                  <input
                    ref={countInputRef}
                    type="number"
                    step="any"
                    min="0"
                    value={countedInput}
                    onChange={(e) => setCountedInput(e.target.value)}
                    disabled={isLiveFetching}
                    placeholder="0.00"
                    className="w-full h-20 sm:h-24 px-4 bg-[#F8F9FA] border-3 border-[#009045] disabled:opacity-50 focus:border-[#009045] rounded-[8px] text-[#1F2937] font-mono text-3xl sm:text-5xl font-black text-center shadow-inner focus:outline-hidden"
                  />
                </div>

                {/* Teclado Inteligente Centrado en la Cantidad del ERP */}
                {(() => {
                  const baseQty = Math.round(finalSystemQty);
                  const suggestedOptions = [
                    { val: Math.max(0, baseQty - 2), diff: '-2' },
                    { val: Math.max(0, baseQty - 1), diff: '-1' },
                    { val: baseQty, diff: 'ERP', isExact: true },
                    { val: baseQty + 1, diff: '+1' },
                    { val: baseQty + 2, diff: '+2' },
                  ];

                  return (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[11px] text-[#6B7280] font-semibold">
                        <span>Cantidades sugeridas rápidas (Centradas en ERP {baseQty} u):</span>
                        <span className="hidden sm:inline">Toque para seleccionar</span>
                      </div>
                      <div className="grid grid-cols-6 gap-2">
                        {suggestedOptions.map((opt, idx) => {
                          const isSelected = countedInput === String(opt.val);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setCountedInput(String(opt.val))}
                              disabled={isLiveFetching}
                              className={`btn-collector border disabled:opacity-50 min-h-[50px] rounded-[8px] flex flex-col items-center justify-center transition active:scale-95 ${
                                opt.isExact
                                  ? isSelected
                                    ? 'bg-[#009045] text-white border-[#009045] shadow-xs'
                                    : 'bg-emerald-50 text-[#009045] border-[#009045]/40 hover:bg-emerald-100 font-bold'
                                  : isSelected
                                  ? 'bg-[#263988] text-white border-[#263988] shadow-xs'
                                  : 'bg-white hover:bg-[#F8F9FA] border-[#E5E7EB] text-[#1F2937]'
                              }`}
                            >
                              <span className="font-mono font-black text-lg sm:text-xl leading-none">{opt.val}</span>
                              <span className="text-[9px] font-bold uppercase mt-1 leading-none opacity-80">
                                {opt.isExact ? 'Exacto' : opt.diff}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setCountedInput('0')}
                          disabled={isLiveFetching}
                          className={`btn-collector border disabled:opacity-50 min-h-[50px] rounded-[8px] flex flex-col items-center justify-center transition active:scale-95 ${
                            countedInput === '0'
                              ? 'bg-[#DC2626] text-white border-[#DC2626] shadow-xs'
                              : 'bg-red-50 hover:bg-red-100 text-[#DC2626] border-red-200'
                          }`}
                          title="Faltante total (0 existencias)"
                        >
                          <span className="font-mono font-black text-lg sm:text-xl leading-none">0</span>
                          <span className="text-[9px] font-bold uppercase mt-1 leading-none">Cero</span>
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Banner de Previsualización Dinámica del Resultado */}
              {isCountValid && !isLiveFetching && (
                <div
                  className={`p-4 rounded-[8px] border-2 flex items-center justify-between transition ${
                    isExactMatch
                      ? 'bg-emerald-50 border-[#009045] text-[#009045]'
                      : 'bg-amber-50 border-[#F59E0B] text-[#1F2937]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {isExactMatch ? (
                      <CheckCircle2 className="w-6 h-6 text-[#009045] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-[#F59E0B] shrink-0" />
                    )}
                    <div>
                      <span className="text-xs uppercase font-bold tracking-wider block">
                        {isExactMatch ? 'Coincidencia Exacta' : 'Discrepancia Calculada'}
                      </span>
                      <span className="text-sm font-semibold">
                        {isExactMatch
                          ? 'El conteo físico coincide al 100% con el sistema.'
                          : liveDiscrepancy < 0
                          ? `Faltante de ${Math.abs(liveDiscrepancy).toFixed(2)} unidades en origen.`
                          : `Sobrante de ${liveDiscrepancy.toFixed(2)} unidades en origen.`}
                      </span>
                    </div>
                  </div>

                  <div className="text-right pl-3 shrink-0">
                    <span className="font-mono text-2xl font-black">
                      {liveDiscrepancy > 0 ? `+${liveDiscrepancy.toFixed(2)}` : liveDiscrepancy.toFixed(2)}
                    </span>
                    <span className="text-[10px] block uppercase font-bold text-[#6B7280]">Diferencia</span>
                  </div>
                </div>
              )}

              {/* BOTÓN DE GUARDADO RÁPIDO */}
              <button
                onClick={handleRegisterCount}
                disabled={!isCountValid || isSubmitting || isLiveFetching}
                className="w-full min-h-[58px] bg-[#009045] hover:bg-[#007a3a] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] text-white font-black text-lg sm:text-xl rounded-[8px] shadow-md flex items-center justify-center gap-3 transition touch-manipulation"
              >
                {isLiveFetching ? <RefreshCw className="w-6 h-6 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                <span>
                  {isLiveFetching
                    ? 'ESPERANDO ERP...'
                    : isSubmitting
                    ? 'REGISTRANDO...'
                    : isAlreadyCounted
                    ? 'ACTUALIZAR CONTEO'
                    : 'REGISTRAR CONTEO'}
                </span>
              </button>
            </>
          )}
        </div>
      ) : (
        /* Estado Vacío - Esperando Escaneo */
        <div className="bg-white border-2 border-dashed border-[#E5E7EB] rounded-[12px] p-8 sm:p-12 text-center text-[#6B7280] space-y-3 card-elevation">
          <div className="w-16 h-16 rounded-[12px] bg-[#009045]/10 border border-[#009045]/20 text-[#009045] flex items-center justify-center mx-auto">
            <Barcode className="w-9 h-9" />
          </div>
          <h3 className="text-lg font-bold text-[#1F2937]">Listo para escanear</h3>
          <p className="text-xs sm:text-sm text-[#6B7280] max-w-md mx-auto leading-relaxed">
            Active el visor de cámara para escanear con la retícula verde o apunte su colector industrial hacia el código de barras.
          </p>

          {/* Acceso Rápido a Tareas Pendientes si existen */}
          {tasks.length > 0 && (
            <div className="pt-4 border-t border-[#E5E7EB] text-left max-w-lg mx-auto">
              <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider block mb-2">
                Últimos SKUs pendientes en la misión:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                {tasks
                  .filter((t) => t.CountedQuantity === null && t.countedQuantity === null && t.countedQuantity === undefined)
                  .slice(0, 8)
                  .map((t) => (
                    <button
                      key={t.TaskId || t.taskId}
                      onClick={() => processDetectedCode(t.SkuCode || t.skuCode || '', 'manual')}
                      className="text-xs font-mono bg-[#F8F9FA] hover:bg-[#009045]/10 border border-[#E5E7EB] hover:border-[#009045] text-[#1F2937] hover:text-[#009045] px-2.5 py-1.5 rounded-[8px] transition"
                    >
                      {t.SkuCode || t.skuCode}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN EXPRESA PARA RE-CONTEO */}
      {showRecountModal && activeTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[16px] max-w-md w-full p-5 sm:p-6 space-y-4 modal-elevation border border-[#E5E7EB]">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-full text-[#D97706] shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#1F2937]">Confirmar Re-conteo</h3>
                <p className="text-xs text-[#6B7280]">Acción de re-auditoría sobre SKU ya registrado</p>
              </div>
            </div>

            <div className="bg-[#F8F9FA] rounded-[8px] p-3 text-xs space-y-1.5 border border-[#E5E7EB]">
              <p className="text-[#4B5563]">
                Este SKU (<strong>{activeTask.SkuCode || activeTask.skuCode}</strong>) ya fue auditado por{' '}
                <strong className="text-[#1F2937]">
                  {auditLogInfo?.auditorName || activeTask.lastAuditorName || activeTask.LastAuditorName || 'el auditor'}
                </strong>{' '}
                el{' '}
                <strong className="text-[#1F2937]">
                  {formatAuditDate(auditLogInfo?.countedAt || activeTask.UpdatedAt || activeTask.updatedAt)}
                </strong>.
              </p>
              <div className="flex items-center justify-between pt-1 font-mono text-xs font-bold text-[#6B7280]">
                <span>Conteo previo: {Number(activeTask.CountedQuantity ?? activeTask.countedQuantity ?? 0).toFixed(2)} u</span>
                <span>Sistema: {Number(activeTask.SystemQuantity ?? activeTask.systemQuantity ?? 0).toFixed(2)} u</span>
              </div>
            </div>

            <p className="text-xs text-[#DC2626] font-semibold bg-red-50 p-2.5 rounded-[8px] border border-red-200">
              ¿Está seguro que desea habilitar el re-conteo? Al guardar, el conteo anterior será reemplazado en la base de datos de Supabase.
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRecountModal(false)}
                className="flex-1 min-h-[44px] bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] font-bold text-xs rounded-[8px] border border-[#E5E7EB] transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecountModal(false);
                  setIsRecountAllowed(true);
                  showToastBanner('Formulario desbloqueado para re-conteo', 'warning');
                  setTimeout(() => {
                    countInputRef.current?.focus();
                    countInputRef.current?.select();
                  }, 50);
                }}
                className="flex-1 min-h-[44px] bg-[#009045] hover:bg-[#007a3a] text-white font-black text-xs rounded-[8px] shadow-xs active:scale-95 transition flex items-center justify-center gap-1.5"
              >
                <Unlock className="w-4 h-4" />
                <span>Sí, volver a contar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLOTANTE NO BLOQUEANTE */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3.5 rounded-[12px] modal-elevation text-xs sm:text-sm font-bold flex items-center justify-between gap-3 max-w-md w-[92%] border animate-slideUp ${
            toast.type === 'warning'
              ? 'bg-[#FEF3C7] text-[#1F2937] border-[#F59E0B]'
              : toast.type === 'success'
              ? 'bg-white border-[#009045] text-[#1F2937]'
              : 'bg-white border-[#DC2626] text-[#1F2937]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-[#009045] shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0" />}
            {toast.type === 'error' && <X className="w-5 h-5 text-[#DC2626] shrink-0" />}
            <span>{toast.text}</span>
          </div>

          {toast.discrepancyVal !== undefined && onNavigateToFloor && (
            <button
              onClick={onNavigateToFloor}
              className="underline text-[11px] font-black text-[#263988] hover:text-[#1d2c6b] shrink-0 ml-2 uppercase"
            >
              Ir al Destino &rarr;
            </button>
          )}
        </div>
      )}
    </div>
  );
};