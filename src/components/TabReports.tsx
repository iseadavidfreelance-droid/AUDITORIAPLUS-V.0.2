/**
 * AUDITORIAPLUS+ - Tab 4: Resumen Ejecutivo y Generación de Reportes PDF
 * Métricas consolidadas, trazabilidad de traslados virtuales (150104)
 * Descarga de flujo binario PDF directo desde Supabase Edge Function `reports-pdf`.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  RefreshCw,
  Printer,
  Table,
  Layers,
  ArrowRight,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Search,
  X,
  SlidersHorizontal,
  Check
} from 'lucide-react';
import { supabase, isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { useMissionStore } from '../store/useMissionStore';
import { useDiscrepancyStore } from '../stores/useDiscrepancyStore';
import { VirtualTransfer, MissionTask, DEPOSIT_NAMES, DepositCode } from '../types/audit';
import { exportTasksToExcel, ExcelExportMode } from '../lib/exportExcel';

type DifferenceFilter = 'ALL' | 'MISSING' | 'SURPLUS' | 'EXACT';
type StatusFilter = 'ALL' | 'PENDING' | 'COMPLETED_MATCH' | 'DISCREPANCY_FOUND' | 'RECONCILED' | 'PARTIALLY_RECONCILED';

export const TabReports: React.FC = () => {
  const { activeMissionId, activeMission, metrics, tasks } = useMissionStore();
  const { virtualTransfers, setVirtualTransfers } = useDiscrepancyStore();

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Estados de filtrado reactivo para Detalle de Tareas
  const [differenceFilter, setDifferenceFilter] = useState<DifferenceFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>('');

  // Estados de filtrado reactivo para Traslados Virtuales Registrados
  const [transferSearchQuery, setTransferSearchQuery] = useState<string>('');
  const [transferDepositFilter, setTransferDepositFilter] = useState<string>('ALL');

  // 1. Cargar traslados virtuales de la misión activa
  const fetchTransfers = useCallback(async () => {
    if (!activeMissionId || !isSupabaseConfigured) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('Read_Virtual_Transfers')
        .select('*')
        .eq('MissionId', activeMissionId)
        .order('CreatedAt', { ascending: false });

      if (error) {
        console.warn('[TabReports] Error al obtener Read_Virtual_Transfers:', error);
      } else if (data) {
        setVirtualTransfers(data as VirtualTransfer[]);
      }
    } catch (err) {
      console.error('[TabReports] Error de red:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeMissionId, setVirtualTransfers]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Cálculos consolidados
  const totalSkus = metrics.totalSkus || tasks.length || 0;
  const countedSkus = metrics.countedSkus || 0;
  const pendingSkus = metrics.pendingSkus || Math.max(0, totalSkus - countedSkus);
  const discrepantSkus = metrics.discrepantSkus || 0;
  const reconciledSkus = metrics.reconciledSkus || 0;
  const costImpact = Math.abs(metrics.totalCostDiscrepancy || 0);

  const auditAccuracyPercent = totalSkus > 0
    ? Math.round((countedSkus / totalSkus) * 100)
    : 0;

  const reconciliationPercent = discrepantSkus + reconciledSkus > 0
    ? Math.round((reconciledSkus / (discrepantSkus + reconciledSkus)) * 100)
    : 100;

  // 2. Conteo reactivo de tareas por diferencia para los badges de los filtros
  const missingTasksCount = useMemo(() => {
    return tasks.filter((t) => Number(t.Discrepancy ?? 0) < 0).length;
  }, [tasks]);

  const surplusTasksCount = useMemo(() => {
    return tasks.filter((t) => Number(t.Discrepancy ?? 0) > 0).length;
  }, [tasks]);

  const exactTasksCount = useMemo(() => {
    return tasks.filter((t) => {
      const isCounted = t.CountedQuantity !== null && t.CountedQuantity !== undefined;
      return isCounted && Number(t.Discrepancy ?? 0) === 0;
    }).length;
  }, [tasks]);

  // 3. Tareas filtradas reactivamente por Diferencia, Estado y Búsqueda
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const disc = Number(task.Discrepancy ?? 0);
      const isCounted = task.CountedQuantity !== null && task.CountedQuantity !== undefined;

      // Filtro por Diferencia
      if (differenceFilter === 'MISSING' && disc >= 0) return false;
      if (differenceFilter === 'SURPLUS' && disc <= 0) return false;
      if (differenceFilter === 'EXACT' && (!isCounted || disc !== 0)) return false;

      // Filtro por Estado
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'DISCREPANCY_FOUND') {
          if (task.Status !== 'DISCREPANT' && disc === 0) return false;
        } else if (task.Status !== statusFilter) {
          return false;
        }
      }

      // Filtro de Búsqueda de Texto (SKU o Descripción)
      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.toLowerCase().trim();
        const sku = (task.SkuCode || task.skuCode || '').toLowerCase();
        const desc = (task.SkuDescription || task.skuDescription || '').toLowerCase();
        if (!sku.includes(q) && !desc.includes(q)) return false;
      }

      return true;
    });
  }, [tasks, differenceFilter, statusFilter, taskSearchQuery]);

  const hasActiveFilters = differenceFilter !== 'ALL' || statusFilter !== 'ALL' || taskSearchQuery.trim() !== '';

  const clearAllFilters = () => {
    setDifferenceFilter('ALL');
    setStatusFilter('ALL');
    setTaskSearchQuery('');
  };

  const appliedFiltersSummary = useMemo(() => {
    const parts: string[] = [];
    if (differenceFilter === 'MISSING') parts.push('Solo Faltantes');
    else if (differenceFilter === 'SURPLUS') parts.push('Solo Sobrantes');
    else if (differenceFilter === 'EXACT') parts.push('Solo Cuadrados');
    else parts.push('Todas las diferencias');

    if (statusFilter === 'PENDING') parts.push('Estado: Pendientes');
    else if (statusFilter === 'COMPLETED_MATCH') parts.push('Estado: Coincidencia Exacta');
    else if (statusFilter === 'DISCREPANCY_FOUND') parts.push('Estado: Discrepancias');
    else if (statusFilter === 'RECONCILED') parts.push('Estado: Trasladados');
    else if (statusFilter === 'PARTIALLY_RECONCILED') parts.push('Estado: Traslado Parcial');

    if (taskSearchQuery.trim()) parts.push(`Búsqueda: "${taskSearchQuery.trim()}"`);

    return parts.join(' | ');
  }, [differenceFilter, statusFilter, taskSearchQuery]);

  // 4. Manejador de Exportación Excel Estilizado
  const handleExportExcel = async (exportMode: ExcelExportMode) => {
    if (filteredTasks.length === 0) {
      showToast('No hay tareas que coincidan con los filtros seleccionados', 'warning');
      return;
    }

    setIsExportingExcel(true);
    setShowExportModal(false);
    showToast('Generando archivo Excel estilizado...', 'success');

    try {
      await exportTasksToExcel({
        missionId: activeMissionId || 'Mision_Auditoria',
        missionName: activeMission?.name || 'Auditoría General',
        depositCode: (activeMission?.depositCode || activeMission?.DepositCode || '150101') as string,
        tasks: filteredTasks,
        metrics,
        mode: exportMode,
        appliedFiltersDesc: appliedFiltersSummary
      });

      showToast(`Excel descargado con éxito (${filteredTasks.length} SKUs exportados)`, 'success');
    } catch (err) {
      console.error('Error generando archivo Excel:', err);
      showToast('Ocurrió un error al generar el archivo Excel', 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // 5. Descargar Reporte PDF Oficial vía Edge Function `reports-pdf`
  const handleDownloadPdf = async () => {
    if (!activeMissionId) {
      showToast('Seleccione primero una misión activa para emitir su reporte', 'warning');
      return;
    }

    setIsDownloadingPdf(true);
    showToast('Generando reporte PDF oficial con Edge Function...', 'success');

    try {
      const endpoint = `${supabaseUrl}/functions/v1/reports-pdf?mission_id=${encodeURIComponent(activeMissionId)}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${supabaseAnonKey}`,
          apikey: supabaseAnonKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Edge Function respondió con status ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(pdfBlob);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `AUDITORIAPLUS_Reporte_${activeMissionId.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
      }, 2000);

      showToast('Reporte PDF descargado con éxito', 'success');
    } catch (err) {
      console.warn('[TabReports] Fallo al invocar Edge Function reports-pdf, usando exportación Excel local:', err);
      handleExportExcel('complete');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Fallback de exportación imprimible local aplicando los filtros activos
  const generateLocalPrintableReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Permita las ventanas emergentes para generar el reporte impreso', 'warning');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>AUDITORIAPLUS+ | Reporte de Auditoría ${activeMissionId}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1F2937; background: #FFFFFF; }
          h1 { color: #263988; border-bottom: 2px solid #009045; padding-bottom: 8px; margin-bottom: 4px; }
          .meta { color: #6B7280; font-size: 13px; margin-bottom: 20px; }
          .kpis { display: flex; gap: 16px; margin-bottom: 24px; }
          .kpi-box { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 16px; flex: 1; }
          .kpi-title { font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: bold; }
          .kpi-val { font-size: 22px; font-weight: 900; margin-top: 4px; color: #1F2937; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th { background: #263988; color: white; text-align: left; padding: 8px 10px; }
          td { border-bottom: 1px solid #E5E7EB; padding: 8px 10px; color: #1F2937; }
          tr:nth-child(even) { background: #F8F9FA; }
          .badge { padding: 2px 8px; border-radius: 9999px; font-weight: bold; font-size: 10px; }
          .badge-match { background: #DCFCE7; color: #009045; }
          .badge-disc { background: #FEE2E2; color: #DC2626; }
          .badge-partial { background: #DBEAFE; color: #263988; }
        </style>
      </head>
      <body>
        <h1>AUDITORIAPLUS+ • Reporte Oficial de Auditoría</h1>
        <div class="meta">
          <strong>Misión:</strong> ${activeMissionId} | 
          <strong>Fecha:</strong> ${new Date().toLocaleString()} | 
          <strong>Filtros aplicados:</strong> ${appliedFiltersSummary}
        </div>

        <div class="kpis">
          <div class="kpi-box">
            <div class="kpi-title">SKUs Mostrados</div>
            <div class="kpi-val">${filteredTasks.length} / ${tasks.length}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Discrepancias</div>
            <div class="kpi-val">${discrepantSkus}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Reconciliados en Piso</div>
            <div class="kpi-val">${reconciledSkus} (${reconciliationPercent}%)</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Impacto Financiero</div>
            <div class="kpi-val">$${costImpact.toFixed(2)}</div>
          </div>
        </div>

        <h3>Detalle de Tareas Filtradas (${filteredTasks.length} SKUs)</h3>
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Descripción</th>
              <th>Costo</th>
              <th>Sistema</th>
              <th>Contado</th>
              <th>Diferencia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTasks.map((t) => {
              const disc = Number(t.Discrepancy ?? 0);
              let displayStatus: string = t.Status;
              if (t.Status === 'RECONCILED') displayStatus = 'TRASLADADO';
              if (t.Status === 'PARTIALLY_RECONCILED') displayStatus = 'TRASLADO PARCIAL';

              return `
              <tr>
                <td><strong>${t.SkuCode}</strong></td>
                <td>${t.SkuDescription}</td>
                <td>$${Number(t.Cost || 0).toFixed(2)}</td>
                <td>${Number(t.SystemQuantity || 0).toFixed(2)}</td>
                <td>${t.CountedQuantity !== null && t.CountedQuantity !== undefined ? Number(t.CountedQuantity).toFixed(2) : '-'}</td>
                <td style="font-weight:bold; color: ${disc === 0 ? '#009045' : disc < 0 ? '#DC2626' : '#F59E0B'}">
                  ${disc === 0 ? '0.00' : disc > 0 ? `+${disc.toFixed(2)}` : disc.toFixed(2)}
                </td>
                <td>
                  <span class="badge ${displayStatus === 'COMPLETED_MATCH' || displayStatus === 'TRASLADADO' ? 'badge-match' : displayStatus === 'TRASLADO PARCIAL' ? 'badge-partial' : 'badge-disc'}">
                    ${displayStatus}
                  </span>
                </td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    showToast('Reporte generado en formato de impresión / PDF', 'success');
  };

  const showToast = (text: string, type: 'success' | 'warning' | 'error') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  // AISLAMIENTO: Filtramos los traslados para solo mostrar los confirmados.
  const executedTransfers = useMemo(() => {
    return virtualTransfers.filter(
      (vt) => vt.Status === 'COMPLETED' || (vt as any).status === 'COMPLETED'
    );
  }, [virtualTransfers]);

  // Filtros reactivos para la lista de Traslados Virtuales Registrados
  const filteredTransfers = useMemo(() => {
    return executedTransfers.filter((vt) => {
      // 1. Filtro por SKU o Descripción
      if (transferSearchQuery.trim()) {
        const q = transferSearchQuery.toLowerCase().trim();
        const sku = (vt.SkuCode || (vt as any).skuCode || '').toLowerCase();
        const desc = (vt.SkuDescription || (vt as any).skuDescription || '').toLowerCase();
        if (!sku.includes(q) && !desc.includes(q)) return false;
      }

      // 2. Filtro por Depósito (Origen o Destino)
      if (transferDepositFilter !== 'ALL') {
        const origin = String(vt.FromDeposit || (vt as any).fromDeposit || (vt as any).OriginDeposit || (vt as any).originDeposit || '');
        const target = String(vt.ToDeposit || (vt as any).toDeposit || (vt as any).DestinationDeposit || (vt as any).destinationDeposit || '');
        if (transferDepositFilter.startsWith('FROM_')) {
          const code = transferDepositFilter.replace('FROM_', '');
          if (origin !== code) return false;
        } else if (transferDepositFilter.startsWith('TO_')) {
          const code = transferDepositFilter.replace('TO_', '');
          if (target !== code) return false;
        }
      }

      return true;
    });
  }, [executedTransfers, transferSearchQuery, transferDepositFilter]);

  const hasActiveTransferFilters = transferSearchQuery.trim() !== '' || transferDepositFilter !== 'ALL';

  const clearTransferFilters = () => {
    setTransferSearchQuery('');
    setTransferDepositFilter('ALL');
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto w-full">
      {/* 1. HEADER DE CONTROL Y BOTÓN DE DESCARGA PDF */}
      <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 sm:p-6 card-elevation flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold bg-[#263988]/10 text-[#263988] px-2.5 py-1 rounded-full border border-[#263988]/20">
              Misión: {activeMissionId ? activeMissionId.slice(0, 12) : 'Sin misión activa'}
            </span>
            <span className="text-xs font-semibold text-[#6B7280]">
              CQRS Analytics
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#1F2937] mt-1.5 tracking-tight">
            Resumen Ejecutivo y Cierre de Auditoría
          </h2>
          <p className="text-xs sm:text-sm text-[#6B7280]">
            Consolidado financiero de inventario físico, mermas y balanceos en tránsito (150104).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchTransfers}
            disabled={isLoading}
            className="btn-collector bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] min-h-[48px] px-3.5 rounded-[8px] text-xs font-bold border border-[#E5E7EB] flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#263988]' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          {/* BOTÓN CTA PRINCIPAL: DESCARGAR REPORTE AUDITORÍA (PDF) */}
          <button
            onClick={handleDownloadPdf}
            disabled={!activeMissionId || isDownloadingPdf}
            className="btn-collector flex-1 sm:flex-none min-h-[48px] bg-[#009045] hover:bg-[#007a3a] disabled:opacity-50 text-white font-black text-xs sm:text-sm px-5 sm:px-6 rounded-[8px] shadow-sm flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {isDownloadingPdf ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>DESCARGANDO PDF...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>DESCARGAR REPORTE AUDITORÍA (PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. CUADRO DE MANDOS DE MÉTRICAS CONSOLIDADAS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Total SKUs Auditados */}
        <div className="bg-white border border-[#E5E7EB] p-4 rounded-[12px] card-elevation">
          <div className="flex items-center justify-between text-[#6B7280] text-xs font-bold uppercase tracking-wider">
            <span>Progreso de Conteo</span>
            <CheckCircle2 className="w-4 h-4 text-[#263988]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#1F2937] font-mono">
              {auditAccuracyPercent}%
            </span>
            <span className="text-xs text-[#6B7280] font-mono">
              ({countedSkus}/{totalSkus})
            </span>
          </div>
          <div className="w-full bg-[#E5E7EB] h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-[#263988] h-full transition-all duration-500 rounded-full"
              style={{ width: `${auditAccuracyPercent}%` }}
            />
          </div>
          <span className="text-[11px] text-[#6B7280] mt-2 block">
            {pendingSkus} SKUs pendientes
          </span>
        </div>

        {/* KPI 2: Discrepancias Totales */}
        <div className="bg-white border border-[#F59E0B]/30 p-4 rounded-[12px] card-elevation">
          <div className="flex items-center justify-between text-[#F59E0B] text-xs font-bold uppercase tracking-wider">
            <span>Discrepancias</span>
            <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#F59E0B] font-mono">
              {discrepantSkus}
            </span>
            <span className="text-xs text-[#F59E0B]/80 font-bold">
              diferencias
            </span>
          </div>
          <p className="text-[11px] text-[#6B7280] mt-3 leading-tight">
            Requieren compensación o ajuste contable
          </p>
        </div>

        {/* KPI 3: Porcentaje de Reconciliación */}
        <div className="bg-white border border-[#009045]/30 p-4 rounded-[12px] card-elevation">
          <div className="flex items-center justify-between text-[#009045] text-xs font-bold uppercase tracking-wider">
            <span>Reconciliación Piso</span>
            <ShieldCheck className="w-4 h-4 text-[#009045]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-[#009045] font-mono">
              {reconciliationPercent}%
            </span>
            <span className="text-xs text-[#009045]/80 font-bold">
              ({reconciledSkus} resueltos)
            </span>
          </div>
          <div className="w-full bg-[#E5E7EB] h-2 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-[#009045] h-full transition-all duration-500 rounded-full"
              style={{ width: `${reconciliationPercent}%` }}
            />
          </div>
          <span className="text-[11px] text-[#009045] mt-2 block font-semibold">
            Compensados con Piso (150103)
          </span>
        </div>

        {/* KPI 4: Impacto Financiero en Costo ($) */}
        <div className="bg-white border border-[#E5E7EB] p-4 rounded-[12px] card-elevation">
          <div className="flex items-center justify-between text-[#6B7280] text-xs font-bold uppercase tracking-wider">
            <span>Impacto en Costo</span>
            <DollarSign className="w-4 h-4 text-[#009045]" />
          </div>
          <div className="mt-2">
            <span className="text-2xl sm:text-3xl font-black font-mono text-[#1F2937]">
              ${costImpact.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-[11px] text-[#6B7280] mt-3 leading-tight">
            Valoración total a costo de las discrepancias
          </p>
        </div>
      </div>

      {/* 3. TABLA DE TRASLADOS VIRTUALES (150104) CON FILTROS Y SCROLLABLE COMPACTO */}
      <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 sm:p-5 card-elevation space-y-4">
        {/* Cabecera con Título, Contador y Filtros Activos */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#009045]" />
            <div>
              <h3 className="text-sm sm:text-base font-black text-[#1F2937] uppercase tracking-wider">
                Traslados Virtuales Registrados
              </h3>
              <p className="text-xs text-[#6B7280]">
                Mostrando <strong className="text-[#1F2937]">{filteredTransfers.length}</strong> de <strong className="text-[#1F2937]">{executedTransfers.length}</strong> traslados confirmados
                {hasActiveTransferFilters && (
                  <span className="text-[#009045] font-semibold ml-1.5">(Filtros activos)</span>
                )}
              </p>
            </div>
          </div>
          <span className="text-xs text-[#6B7280] font-mono bg-[#F8F9FA] px-2.5 py-1 rounded-full border border-[#E5E7EB] self-start sm:self-auto">
            Nodo Intermediario (150104)
          </span>
        </div>

        {/* BARRA DE HERRAMIENTAS DE FILTROS PARA TRASLADOS */}
        {executedTransfers.length > 0 && (
          <div className="p-3 bg-[#F8F9FA] rounded-[8px] border border-[#E5E7EB]">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full">
                {/* Selector de Depósito (Origen / Destino) */}
                <div className="w-full sm:w-56">
                  <select
                    value={transferDepositFilter}
                    onChange={(e) => setTransferDepositFilter(e.target.value)}
                    className="w-full h-9 px-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[#1F2937] text-xs font-semibold focus:border-[#009045] focus:outline-hidden"
                  >
                    <option value="ALL">Todos los Depósitos</option>
                    <option value="FROM_150101">Origen: Almacén Principal (150101)</option>
                    <option value="FROM_150103">Origen: Piso de Venta (150103)</option>
                    <option value="TO_150103">Destino: Piso de Venta (150103)</option>
                    <option value="TO_150101">Destino: Almacén Principal (150101)</option>
                    <option value="TO_150104">Tránsito Virtual (150104)</option>
                  </select>
                </div>

                {/* Búsqueda por SKU o Descripción */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={transferSearchQuery}
                    onChange={(e) => setTransferSearchQuery(e.target.value)}
                    placeholder="Buscar SKU o descripción..."
                    className="w-full h-9 pl-8 pr-7 bg-white border border-[#E5E7EB] rounded-[8px] text-[#1F2937] text-xs focus:border-[#009045] focus:outline-hidden"
                  />
                  {transferSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTransferSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {hasActiveTransferFilters && (
                  <button
                    type="button"
                    onClick={clearTransferFilters}
                    className="text-xs text-[#DC2626] hover:underline font-bold px-1 whitespace-nowrap"
                  >
                    Restablecer
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TABLA DESLIZABLE COMPACTA CON CABECERA FIJA */}
        {executedTransfers.length === 0 ? (
          <div className="bg-[#F8F9FA] border border-dashed border-[#E5E7EB] rounded-[8px] p-6 text-center text-[#6B7280]">
            <p className="text-sm font-semibold text-[#1F2937]">
              No hay traslados virtuales confirmados para esta misión
            </p>
            <p className="text-xs text-[#6B7280] mt-1">
              Los traslados se muestran aquí una vez son confirmados manualmente.
            </p>
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="bg-[#F8F9FA] border border-dashed border-[#E5E7EB] rounded-[8px] p-6 text-center text-[#6B7280]">
            <p className="text-sm font-semibold text-[#1F2937]">
              No hay traslados que coincidan con los filtros de búsqueda
            </p>
            <p className="text-xs text-[#6B7280] mt-1">
              Pruebe cambiando el depósito o el término de búsqueda, o{' '}
              <button
                type="button"
                onClick={clearTransferFilters}
                className="text-[#263988] font-bold underline"
              >
                restablezca los filtros
              </button>
              .
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto custom-scrollbar border border-[#E5E7EB] rounded-[8px]">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead className="bg-[#F8F9FA] sticky top-0 border-b border-[#E5E7EB] z-10 shadow-xs">
                <tr className="text-[#6B7280] text-[11px] uppercase font-bold tracking-wider">
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Descripción</th>
                  <th className="py-2.5 px-3 text-center">Flujo de Depósitos</th>
                  <th className="py-2.5 px-3 text-right">Cantidad Compensada</th>
                  <th className="py-2.5 px-3 text-right">Fecha / Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] font-mono bg-white">
                {filteredTransfers.map((vt) => {
                  const fromCode = vt.FromDeposit || (vt as any).fromDeposit || (vt as any).OriginDeposit || '150103';
                  const toCode = vt.ToDeposit || (vt as any).toDeposit || (vt as any).DestinationDeposit || '150104';
                  const fromName = DEPOSIT_NAMES[fromCode as DepositCode] || `Dep. ${fromCode}`;
                  const toName = DEPOSIT_NAMES[toCode as DepositCode] || `Dep. ${toCode}`;

                  return (
                    <tr key={vt.TransferId || (vt as any).transferId} className="hover:bg-[#F8F9FA] transition">
                      <td className="py-2.5 px-3 font-bold text-[#263988]">
                        {vt.SkuCode || (vt as any).skuCode}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[#1F2937] max-w-xs truncate">
                        {vt.SkuDescription || (vt as any).skuDescription || 'Artículo auditado'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#1F2937] bg-[#F8F9FA] px-2.5 py-1 rounded-full border border-[#E5E7EB]">
                          <span>{fromName}</span>
                          <ArrowRight className="w-3 h-3 text-[#009045]" />
                          <strong className="text-[#009045]">{toName}</strong>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-[#009045]">
                        +{Number((vt as any).TransferredQuantity || (vt as any).TransferQuantity || 0).toFixed(2)} u
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#6B7280] text-xs">
                        {new Date(vt.CreatedAt || Date.now()).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. LISTADO RÁPIDO Y FILTRADO DE TAREAS DE LA MISIÓN */}
      {tasks.length > 0 && (
        <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-4 sm:p-5 card-elevation space-y-4">
          {/* Header con título y botón de Exportar Excel */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs sm:text-sm font-black text-[#1F2937] uppercase tracking-wider flex items-center gap-2">
                <Table className="w-4 h-4 text-[#263988]" />
                <span>Detalle de Tareas de Inventario</span>
              </h3>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Mostrando <strong className="text-[#1F2937]">{filteredTasks.length}</strong> de <strong className="text-[#1F2937]">{tasks.length}</strong> SKUs
                {hasActiveFilters && (
                  <span className="text-[#009045] font-semibold ml-1.5">(Filtros activos)</span>
                )}
              </p>
            </div>

            {/* BOTÓN REEMPLAZADO: EXPORTAR EXCEL ESTILIZADO */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowExportModal(true)}
                disabled={isExportingExcel || filteredTasks.length === 0}
                className="btn-collector bg-[#009045] hover:bg-[#007a3a] disabled:opacity-50 text-white min-h-[44px] px-4 rounded-[8px] text-xs font-black shadow-xs flex items-center gap-2 active:scale-95 transition"
                title="Exportar archivo Excel estilizado con los filtros aplicados"
              >
                <FileSpreadsheet className={`w-4 h-4 ${isExportingExcel ? 'animate-spin' : ''}`} />
                <span>{isExportingExcel ? 'GENERANDO EXCEL...' : 'EXPORTAR EXCEL (.XLSX)'}</span>
              </button>
            </div>
          </div>

          {/* BARRA DE HERRAMIENTAS DE FILTROS REACTIVOS */}
          <div className="p-3 bg-[#F8F9FA] rounded-[8px] border border-[#E5E7EB] space-y-3">
            <div className="flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between">
              
              {/* Filtro por Tipo de Diferencia */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-[#263988]" /> Diferencia:
                </span>
                <button
                  type="button"
                  onClick={() => setDifferenceFilter('ALL')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-[8px] transition ${
                    differenceFilter === 'ALL'
                      ? 'bg-[#263988] text-white shadow-xs'
                      : 'bg-white text-[#1F2937] border border-[#E5E7EB] hover:bg-[#F8F9FA]'
                  }`}
                >
                  Todos ({tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDifferenceFilter('MISSING')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-[8px] transition ${
                    differenceFilter === 'MISSING'
                      ? 'bg-[#DC2626] text-white shadow-xs'
                      : 'bg-white text-[#DC2626] border border-[#DC2626]/30 hover:bg-red-50'
                  }`}
                >
                  Faltantes (&lt;0) ({missingTasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDifferenceFilter('SURPLUS')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-[8px] transition ${
                    differenceFilter === 'SURPLUS'
                      ? 'bg-[#F59E0B] text-white shadow-xs'
                      : 'bg-white text-[#F59E0B] border border-[#F59E0B]/30 hover:bg-amber-50'
                  }`}
                >
                  Sobrantes (&gt;0) ({surplusTasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDifferenceFilter('EXACT')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-[8px] transition ${
                    differenceFilter === 'EXACT'
                      ? 'bg-[#009045] text-white shadow-xs'
                      : 'bg-white text-[#009045] border border-[#009045]/30 hover:bg-emerald-50'
                  }`}
                >
                  Cuadrados (=0) ({exactTasksCount})
                </button>
              </div>

              {/* Filtro por Estado y Búsqueda por SKU / Nombre */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <div className="w-full sm:w-auto">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="w-full sm:w-44 h-9 px-2.5 bg-white border border-[#E5E7EB] rounded-[8px] text-[#1F2937] text-xs font-semibold focus:border-[#009045] focus:outline-hidden"
                  >
                    <option value="ALL">Todos los Estados</option>
                    <option value="PENDING">Pendientes de conteo</option>
                    <option value="COMPLETED_MATCH">Coincidencia exacta</option>
                    <option value="DISCREPANCY_FOUND">Con discrepancia</option>
                    <option value="RECONCILED">Trasladados</option>
                    <option value="PARTIALLY_RECONCILED">Traslado parcial</option>
                  </select>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={taskSearchQuery}
                    onChange={(e) => setTaskSearchQuery(e.target.value)}
                    placeholder="Buscar SKU o nombre..."
                    className="w-full h-9 pl-8 pr-7 bg-white border border-[#E5E7EB] rounded-[8px] text-[#1F2937] text-xs focus:border-[#009045] focus:outline-hidden"
                  />
                  {taskSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTaskSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs text-[#DC2626] hover:underline font-bold px-1 whitespace-nowrap"
                  >
                    Restablecer
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TABLA DE TAREAS FILTRADAS */}
          {filteredTasks.length === 0 ? (
            <div className="p-8 bg-[#F8F9FA] border border-dashed border-[#E5E7EB] rounded-[8px] text-center space-y-2">
              <Filter className="w-8 h-8 text-[#6B7280] mx-auto" />
              <p className="text-sm font-bold text-[#1F2937]">No hay SKUs que coincidan con los filtros seleccionados</p>
              <p className="text-xs text-[#6B7280]">
                Pruebe cambiando el tipo de diferencia o el estado, o{' '}
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-[#263988] font-bold underline"
                >
                  restablezca todos los filtros
                </button>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 custom-scrollbar border border-[#E5E7EB] rounded-[8px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FA] text-[#6B7280] text-[10px] uppercase font-bold sticky top-0 border-b border-[#E5E7EB]">
                  <tr>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3">Descripción</th>
                    <th className="py-2.5 px-3 text-right">Sistema (S)</th>
                    <th className="py-2.5 px-3 text-right">Contado (Qc)</th>
                    <th className="py-2.5 px-3 text-right">Diferencia</th>
                    <th className="py-2.5 px-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB] bg-white">
                  {filteredTasks.map((task) => {
                    const disc = Number(task.Discrepancy ?? 0);
                    const isCounted = task.CountedQuantity !== null && task.CountedQuantity !== undefined;

                    let displayStatus: string = task.Status;
                    if (task.Status === 'RECONCILED') displayStatus = 'TRASLADADO';
                    if (task.Status === 'PARTIALLY_RECONCILED') displayStatus = 'TRASLADO PARCIAL';
                    if (task.Status === 'COMPLETED_MATCH') displayStatus = 'COINCIDENCIA EXACTA';
                    if (task.Status === 'PENDING') displayStatus = 'PENDIENTE';
                    if (task.Status === 'DISCREPANT') displayStatus = 'DISCREPANCIA';

                    return (
                      <tr key={task.TaskId || task.taskId} className="hover:bg-[#F8F9FA] transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-[#1F2937]">
                          {task.SkuCode || task.skuCode}
                        </td>
                        <td className="py-2.5 px-3 text-[#6B7280] truncate max-w-xs">
                          {task.SkuDescription || task.skuDescription}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#1F2937]">
                          {Number(task.SystemQuantity ?? 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[#1F2937]">
                          {isCounted ? Number(task.CountedQuantity).toFixed(2) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          <span
                            className={
                              disc === 0
                                ? 'text-[#009045]'
                                : disc < 0
                                ? 'text-[#DC2626]'
                                : 'text-[#F59E0B]'
                            }
                          >
                            {disc === 0 ? '0.00' : disc > 0 ? `+${disc.toFixed(2)}` : disc.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              displayStatus === 'COINCIDENCIA EXACTA' || displayStatus === 'TRASLADADO'
                                ? 'bg-emerald-50 text-[#009045] border-[#009045]/30'
                                : displayStatus === 'TRASLADO PARCIAL'
                                ? 'bg-blue-50 text-[#263988] border-[#263988]/30'
                                : displayStatus === 'PENDIENTE'
                                ? 'bg-[#F8F9FA] text-[#6B7280] border-[#E5E7EB]'
                                : 'bg-amber-50 text-[#F59E0B] border-[#F59E0B]/30'
                            }`}
                          >
                            {displayStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL DE SELECCIÓN DE FORMATO EXCEL */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white border border-[#E5E7EB] rounded-[12px] p-6 modal-elevation relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-[8px] bg-[#009045]/10 text-[#009045] flex items-center justify-center border border-[#009045]/20 shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1F2937] leading-snug">Exportar a Excel (.xlsx)</h3>
                  <p className="text-[11px] text-[#6B7280]">{filteredTasks.length} SKUs filtrados para descarga</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="p-1 text-[#6B7280] hover:text-[#1F2937] rounded-[8px]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs text-[#1F2937] font-semibold">Elija la modalidad de exportación:</p>

              {/* Opción 1: Reporte Ejecutivo con KPIs */}
              <button
                type="button"
                onClick={() => handleExportExcel('executive')}
                disabled={isExportingExcel}
                className="w-full text-left p-3.5 rounded-[8px] border border-[#E5E7EB] hover:border-[#009045] bg-[#F8F9FA] hover:bg-emerald-50/50 transition group cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-black text-[#1F2937] group-hover:text-[#009045] flex items-center gap-1.5">
                      📊 Hoja Única con KPIs y Tabla Estilizada
                    </span>
                    <p className="text-[11px] text-[#6B7280] leading-snug">
                      Incluye banner corporativo, tarjetas de indicadores clave y tabla formateada con totales calculados.
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-[#6B7280] group-hover:text-[#009045] shrink-0 mt-0.5" />
                </div>
              </button>

              {/* Opción 2: Tabla de Datos Directa */}
              <button
                type="button"
                onClick={() => handleExportExcel('direct')}
                disabled={isExportingExcel}
                className="w-full text-left p-3.5 rounded-[8px] border border-[#E5E7EB] hover:border-[#263988] bg-[#F8F9FA] hover:bg-blue-50/50 transition group cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-black text-[#1F2937] group-hover:text-[#263988] flex items-center gap-1.5">
                      📑 Tabla de Datos Directa (Corporativa)
                    </span>
                    <p className="text-[11px] text-[#6B7280] leading-snug">
                      Formato tabular optimizado con encabezados en azul marino y autofiltros activos, ideal para análisis y ERPs.
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-[#6B7280] group-hover:text-[#263988] shrink-0 mt-0.5" />
                </div>
              </button>

              {/* Opción 3: Libro Completo (Ambas Hojas) */}
              <button
                type="button"
                onClick={() => handleExportExcel('complete')}
                disabled={isExportingExcel}
                className="w-full text-left p-3.5 rounded-[8px] border border-[#263988]/30 hover:border-[#263988] bg-[#263988]/5 hover:bg-[#263988]/10 transition group cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-xs font-black text-[#263988] flex items-center gap-1.5">
                      📦 Libro Completo (Ambas Hojas)
                    </span>
                    <p className="text-[11px] text-[#6B7280] leading-snug">
                      Genera ambas pestañas (*Resumen Ejecutivo* y *Datos Detallados*) en un solo archivo .xlsx.
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-[#263988] shrink-0 mt-0.5" />
                </div>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="btn-collector bg-[#F8F9FA] hover:bg-[#E5E7EB] text-[#1F2937] px-4 py-2 text-xs font-bold rounded-[8px] border border-[#E5E7EB]"
              >
                Cancelar
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
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
};