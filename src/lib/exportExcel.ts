/**
 * AUDITORIAPLUS+ - Generador de Exportación Excel (.xlsx) Estilizado
 * Utiliza ExcelJS para crear libros de trabajo de alta fidelidad estética
 * alineados estrictamente con la paleta corporativa:
 * - Azul Marino Profundo: #263988 (FF263988)
 * - Verde Esmeralda: #009045 (FF009045)
 * - Superficie: #FFFFFF (FFFFFFFF)
 * - Fondo Suave: #F8F9FA (FFF8F9FA)
 * - Texto Principal: #1F2937 (FF1F2937)
 * - Texto Secundario: #6B7280 (FF6B7280)
 * - Peligro / Faltante: #DC2626 (FFDC2626)
 * - Advertencia / Sobrante: #F59E0B (FFF59E0B)
 * - Divisores: #E5E7EB (FFE5E7EB)
 */

import ExcelJS from 'exceljs';
import { MissionTask, MissionMetrics } from '../types/audit';

export type ExcelExportMode = 'complete' | 'executive' | 'direct';

interface ExportExcelOptions {
  missionId: string;
  missionName?: string;
  depositCode?: string;
  tasks: MissionTask[];
  metrics: MissionMetrics;
  mode?: ExcelExportMode;
  appliedFiltersDesc?: string;
}

const COLOR_NAVY = 'FF263988';
const COLOR_EMERALD = 'FF009045';
const COLOR_WHITE = 'FFFFFFFF';
const COLOR_LIGHT_BG = 'FFF8F9FA';
const COLOR_TEXT_DARK = 'FF1F2937';
const COLOR_TEXT_MUTED = 'FF6B7280';
const COLOR_DANGER = 'FFDC2626';
const COLOR_WARNING = 'FFF59E0B';
const COLOR_BORDER = 'FFE5E7EB';

const COLOR_BG_MATCH = 'FFDCFCE7';
const COLOR_BG_DANGER = 'FFFEE2E2';
const COLOR_BG_WARNING = 'FFFEF3C7';
const COLOR_BG_NAVY_LIGHT = 'FFDBEAFE';

export async function exportTasksToExcel({
  missionId,
  missionName,
  depositCode = '150101',
  tasks,
  metrics,
  mode = 'complete',
  appliedFiltersDesc = 'Todos los registros'
}: ExportExcelOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AUDITORIAPLUS+';
  workbook.lastModifiedBy = 'AUDITORIAPLUS+';
  workbook.created = new Date();
  workbook.modified = new Date();

  const totalTasksCount = tasks.length;
  const countedTasks = tasks.filter(t => t.CountedQuantity !== null && t.CountedQuantity !== undefined);
  const countedCount = countedTasks.length;
  const missingCount = tasks.filter(t => Number(t.Discrepancy ?? 0) < 0).length;
  const surplusCount = tasks.filter(t => Number(t.Discrepancy ?? 0) > 0).length;
  const exactCount = countedTasks.filter(t => Number(t.Discrepancy ?? 0) === 0).length;

  // 1. HOJA DE RESUMEN EJECUTIVO (Con KPIs y Tabla Estilizada)
  if (mode === 'complete' || mode === 'executive') {
    const wsExecutive = workbook.addWorksheet('Resumen Ejecutivo', {
      views: [{ showGridLines: true }]
    });

    // Column widths
    wsExecutive.columns = [
      { width: 14 }, // A: SKU
      { width: 38 }, // B: Descripción
      { width: 14 }, // C: Costo Unitario
      { width: 16 }, // D: Stock Sistema
      { width: 16 }, // E: Ventas Auditoría
      { width: 16 }, // F: Stock Teórico
      { width: 16 }, // G: Físico Contado
      { width: 15 }, // H: Diferencia
      { width: 18 }, // I: Impacto Costo ($)
      { width: 22 }  // J: Estado
    ];

    // Fila 1: Banner Superior Corporativo
    wsExecutive.mergeCells('A1:J1');
    const headerBanner = wsExecutive.getCell('A1');
    headerBanner.value = 'AUDITORIAPLUS+  |  REPORTE EJECUTIVO DE AUDITORÍA FÍSICA';
    headerBanner.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_NAVY }
    };
    headerBanner.font = {
      name: 'Calibri',
      size: 15,
      bold: true,
      color: { argb: COLOR_WHITE }
    };
    headerBanner.alignment = { vertical: 'middle', horizontal: 'center' };
    wsExecutive.getRow(1).height = 40;

    // Fila 2: Subtítulo con metadata
    wsExecutive.mergeCells('A2:J2');
    const subBanner = wsExecutive.getCell('A2');
    subBanner.value = `Misión: ${missionName || missionId}  |  Depósito Base: ${depositCode}  |  Fecha: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}  |  Filtro: ${appliedFiltersDesc}`;
    subBanner.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLOR_LIGHT_BG }
    };
    subBanner.font = {
      name: 'Calibri',
      size: 10,
      italic: true,
      color: { argb: COLOR_TEXT_MUTED }
    };
    subBanner.alignment = { vertical: 'middle', horizontal: 'center' };
    wsExecutive.getRow(2).height = 24;

    // Espacio en Fila 3
    wsExecutive.getRow(3).height = 10;

    // Fila 4 & 5: Cuadro de Mando de KPIs (4 tarjetas consolidadas)
    // Tarjeta 1: Total SKUs en selección (A4:B5)
    wsExecutive.mergeCells('A4:B4');
    wsExecutive.getCell('A4').value = 'SKUS EVALUADOS';
    wsExecutive.getCell('A4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR_TEXT_MUTED } };
    wsExecutive.getCell('A4').alignment = { vertical: 'middle', horizontal: 'center' };

    wsExecutive.mergeCells('A5:B5');
    wsExecutive.getCell('A5').value = `${countedCount} / ${totalTasksCount}`;
    wsExecutive.getCell('A5').font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_NAVY } };
    wsExecutive.getCell('A5').alignment = { vertical: 'middle', horizontal: 'center' };

    // Tarjeta 2: Discrepancias / Faltantes (C4:D5)
    wsExecutive.mergeCells('C4:D4');
    wsExecutive.getCell('C4').value = 'FALTANTES DETECTADOS';
    wsExecutive.getCell('C4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR_DANGER } };
    wsExecutive.getCell('C4').alignment = { vertical: 'middle', horizontal: 'center' };

    wsExecutive.mergeCells('C5:D5');
    wsExecutive.getCell('C5').value = missingCount;
    wsExecutive.getCell('C5').font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_DANGER } };
    wsExecutive.getCell('C5').alignment = { vertical: 'middle', horizontal: 'center' };

    // Tarjeta 3: Sobrantes (E4:F5)
    wsExecutive.mergeCells('E4:F4');
    wsExecutive.getCell('E4').value = 'SOBRANTES DETECTADOS';
    wsExecutive.getCell('E4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR_WARNING } };
    wsExecutive.getCell('E4').alignment = { vertical: 'middle', horizontal: 'center' };

    wsExecutive.mergeCells('E5:F5');
    wsExecutive.getCell('E5').value = surplusCount;
    wsExecutive.getCell('E5').font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_WARNING } };
    wsExecutive.getCell('E5').alignment = { vertical: 'middle', horizontal: 'center' };

    // Tarjeta 4: Cuadrados (G4:H5)
    wsExecutive.mergeCells('G4:H4');
    wsExecutive.getCell('G4').value = 'COINCIDENCIAS EXACTAS';
    wsExecutive.getCell('G4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR_EMERALD } };
    wsExecutive.getCell('G4').alignment = { vertical: 'middle', horizontal: 'center' };

    wsExecutive.mergeCells('G5:H5');
    wsExecutive.getCell('G5').value = exactCount;
    wsExecutive.getCell('G5').font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLOR_EMERALD } };
    wsExecutive.getCell('G5').alignment = { vertical: 'middle', horizontal: 'center' };

    // Tarjeta 5: Impacto Costo ($) (I4:J5)
    wsExecutive.mergeCells('I4:J4');
    wsExecutive.getCell('I4').value = 'IMPACTO FINANCIERO TOTAL';
    wsExecutive.getCell('I4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: COLOR_TEXT_MUTED } };
    wsExecutive.getCell('I4').alignment = { vertical: 'middle', horizontal: 'center' };

    wsExecutive.mergeCells('I5:J5');
    const totalCostDiscrepancy = tasks.reduce((sum, t) => sum + (Number(t.Discrepancy ?? 0) * Number(t.Cost ?? 0)), 0);
    wsExecutive.getCell('I5').value = totalCostDiscrepancy;
    wsExecutive.getCell('I5').numFmt = '$#,##0.00;($#,##0.00);"$0.00"';
    wsExecutive.getCell('I5').font = { name: 'Calibri', size: 14, bold: true, color: { argb: totalCostDiscrepancy < 0 ? COLOR_DANGER : COLOR_NAVY } };
    wsExecutive.getCell('I5').alignment = { vertical: 'middle', horizontal: 'center' };

    // Aplicar bordes suaves a las tarjetas
    const kpiRanges = ['A4:B5', 'C4:D5', 'E4:F5', 'G4:H5', 'I4:J5'];
    kpiRanges.forEach(range => {
      const [start, end] = range.split(':');
      const startCol = start.charCodeAt(0) - 64;
      const endCol = end.charCodeAt(0) - 64;
      for (let r = 4; r <= 5; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const cell = wsExecutive.getRow(r).getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_LIGHT_BG } };
          cell.border = {
            top: { style: 'thin', color: { argb: COLOR_BORDER } },
            left: { style: 'thin', color: { argb: COLOR_BORDER } },
            bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
            right: { style: 'thin', color: { argb: COLOR_BORDER } }
          };
        }
      }
    });

    wsExecutive.getRow(6).height = 12;

    // Fila 7: Cabeceras de la tabla
    const tableHeaders = [
      'CÓDIGO SKU',
      'DESCRIPCIÓN DEL ARTÍCULO',
      'COSTO UNIT.',
      'SISTEMA (S)',
      'VENTAS HOY (V)',
      'TEÓRICO (S - V)',
      'FÍSICO (Qc)',
      'DIFERENCIA',
      'IMPACTO ($)',
      'ESTADO AUDITORÍA'
    ];

    const headerRow = wsExecutive.getRow(7);
    headerRow.height = 28;
    tableHeaders.forEach((text, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = text;
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_NAVY }
      };
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: COLOR_WHITE }
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: idx === 0 ? 'center' : idx === 1 ? 'left' : idx === 9 ? 'center' : 'right'
      };
      cell.border = {
        bottom: { style: 'medium', color: { argb: COLOR_EMERALD } }
      };
    });

    // Filas de datos
    let currentRowIdx = 8;
    tasks.forEach((t, i) => {
      const row = wsExecutive.getRow(currentRowIdx);
      row.height = 22;

      const cost = Number(t.Cost || 0);
      const system = Number(t.SystemQuantity || 0);
      const sales = Number(t.SalesDuringAudit || 0);
      const theoretical = system - sales;
      const counted = t.CountedQuantity !== null && t.CountedQuantity !== undefined ? Number(t.CountedQuantity) : null;
      const discrepancy = Number(t.Discrepancy ?? 0);
      const impact = (t.Status === 'RECONCILED' || (t as any).Status === 'PARTIALLY_RECONCILED')
        ? 0
        : discrepancy * cost;

      let displayStatus: string = t.Status;
      if (t.Status === 'RECONCILED' || (t as any).Status === 'PARTIALLY_RECONCILED') displayStatus = 'TRASLADADO';
      if (t.Status === 'COMPLETED_MATCH') displayStatus = 'COINCIDENCIA EXACTA';
      if (t.Status === 'PENDING') displayStatus = 'PENDIENTE';
      if (t.Status === 'DISCREPANT') displayStatus = 'DISCREPANCIA';

      const isEven = i % 2 === 0;
      const rowBgColor = isEven ? COLOR_WHITE : COLOR_LIGHT_BG;

      // Col A: SKU
      const cellSku = row.getCell(1);
      cellSku.value = t.SkuCode;
      cellSku.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_TEXT_DARK } };
      cellSku.alignment = { vertical: 'middle', horizontal: 'center' };

      // Col B: Descripción
      const cellDesc = row.getCell(2);
      cellDesc.value = t.SkuDescription;
      cellDesc.font = { name: 'Calibri', size: 10, color: { argb: COLOR_TEXT_DARK } };
      cellDesc.alignment = { vertical: 'middle', horizontal: 'left' };

      // Col C: Costo
      const cellCost = row.getCell(3);
      cellCost.value = cost;
      cellCost.numFmt = '$#,##0.00';
      cellCost.font = { name: 'Calibri', size: 10, color: { argb: COLOR_TEXT_DARK } };
      cellCost.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col D: Sistema
      const cellSys = row.getCell(4);
      cellSys.value = system;
      cellSys.numFmt = '#,##0.00';
      cellSys.font = { name: 'Calibri', size: 10, color: { argb: COLOR_TEXT_DARK } };
      cellSys.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col E: Ventas
      const cellSales = row.getCell(5);
      cellSales.value = sales;
      cellSales.numFmt = '#,##0.00';
      cellSales.font = { name: 'Calibri', size: 10, color: { argb: COLOR_WARNING } };
      cellSales.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col F: Teórico
      const cellTheo = row.getCell(6);
      cellTheo.value = theoretical;
      cellTheo.numFmt = '#,##0.00';
      cellTheo.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_NAVY } };
      cellTheo.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col G: Contado
      const cellCounted = row.getCell(7);
      if (counted !== null) {
        cellCounted.value = counted;
        cellCounted.numFmt = '#,##0.00';
        cellCounted.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_TEXT_DARK } };
      } else {
        cellCounted.value = '-';
        cellCounted.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLOR_TEXT_MUTED } };
      }
      cellCounted.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col H: Diferencia
      const cellDisc = row.getCell(8);
      cellDisc.value = discrepancy;
      cellDisc.numFmt = '+#,##0.00;-#,##0.00;0.00';
      cellDisc.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: {
          argb: discrepancy === 0 ? COLOR_EMERALD : discrepancy < 0 ? COLOR_DANGER : COLOR_WARNING
        }
      };
      cellDisc.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col I: Impacto Costo ($)
      const cellImp = row.getCell(9);
      cellImp.value = impact;
      cellImp.numFmt = '$#,##0.00;($#,##0.00);"$0.00"';
      cellImp.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: {
          argb: impact === 0 ? COLOR_EMERALD : impact < 0 ? COLOR_DANGER : COLOR_WARNING
        }
      };
      cellImp.alignment = { vertical: 'middle', horizontal: 'right' };

      // Col J: Estado
      const cellStat = row.getCell(10);
      cellStat.value = displayStatus;
      cellStat.font = {
        name: 'Calibri',
        size: 9,
        bold: true,
        color: {
          argb: displayStatus === 'COINCIDENCIA EXACTA' || displayStatus === 'TRASLADADO'
            ? COLOR_EMERALD
            : displayStatus === 'TRASLADO PARCIAL'
            ? COLOR_NAVY
            : displayStatus === 'PENDIENTE'
            ? COLOR_TEXT_MUTED
            : COLOR_DANGER
        }
      };
      cellStat.alignment = { vertical: 'middle', horizontal: 'center' };

      // Aplicar fondo alterno y bordes
      for (let c = 1; c <= 10; c++) {
        const cell = row.getCell(c);
        if (c !== 8 && c !== 10) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
        } else if (c === 8) {
          // Fondo suave según diferencia
          const discBg = discrepancy === 0 ? COLOR_BG_MATCH : discrepancy < 0 ? COLOR_BG_DANGER : COLOR_BG_WARNING;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: discBg } };
        } else if (c === 10) {
          const statBg = (displayStatus === 'COINCIDENCIA EXACTA' || displayStatus === 'TRASLADADO')
            ? COLOR_BG_MATCH
            : displayStatus === 'PENDIENTE'
            ? COLOR_LIGHT_BG
            : COLOR_BG_WARNING;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statBg } };
        }

        cell.border = {
          bottom: { style: 'thin', color: { argb: COLOR_BORDER } },
          left: { style: 'thin', color: { argb: COLOR_BORDER } },
          right: { style: 'thin', color: { argb: COLOR_BORDER } }
        };
      }

      currentRowIdx++;
    });

    // Fila de Totales
    const totalRow = wsExecutive.getRow(currentRowIdx);
    totalRow.height = 26;
    totalRow.getCell(1).value = 'TOTALES:';
    totalRow.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_NAVY } };
    totalRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };

    totalRow.getCell(2).value = `${tasks.length} SKUs procesados`;
    totalRow.getCell(2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_TEXT_MUTED } };

    // Fórmulas de suma
    const startRow = 8;
    const endRow = currentRowIdx - 1;

    if (tasks.length > 0) {
      totalRow.getCell(4).value = { formula: `SUM(D${startRow}:D${endRow})` };
      totalRow.getCell(4).numFmt = '#,##0.00';
      totalRow.getCell(5).value = { formula: `SUM(E${startRow}:E${endRow})` };
      totalRow.getCell(5).numFmt = '#,##0.00';
      totalRow.getCell(6).value = { formula: `SUM(F${startRow}:F${endRow})` };
      totalRow.getCell(6).numFmt = '#,##0.00';
      totalRow.getCell(7).value = { formula: `SUM(G${startRow}:G${endRow})` };
      totalRow.getCell(7).numFmt = '#,##0.00';
      totalRow.getCell(8).value = { formula: `SUM(H${startRow}:H${endRow})` };
      totalRow.getCell(8).numFmt = '+#,##0.00;-#,##0.00;0.00';
      totalRow.getCell(9).value = { formula: `SUM(I${startRow}:I${endRow})` };
      totalRow.getCell(9).numFmt = '$#,##0.00;($#,##0.00);"$0.00"';
    }

    for (let c = 1; c <= 10; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_LIGHT_BG } };
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLOR_NAVY } };
      cell.border = {
        top: { style: 'medium', color: { argb: COLOR_NAVY } },
        bottom: { style: 'double', color: { argb: COLOR_NAVY } }
      };
    }
  }

  // 2. HOJA DE TABLA DE DATOS DIRECTA (Para Pivot Tables y ERP)
  if (mode === 'complete' || mode === 'direct') {
    const wsDirect = workbook.addWorksheet('Datos Detallados', {
      views: [{ showGridLines: true }]
    });

    wsDirect.columns = [
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Descripción', key: 'description', width: 36 },
      { header: 'Depósito', key: 'deposit', width: 12 },
      { header: 'Costo Unitario ($)', key: 'cost', width: 15 },
      { header: 'Stock Sistema', key: 'system', width: 15 },
      { header: 'Ventas Auditoría', key: 'sales', width: 16 },
      { header: 'Stock Teórico', key: 'theoretical', width: 15 },
      { header: 'Conteo Físico', key: 'counted', width: 15 },
      { header: 'Diferencia (Unidades)', key: 'discrepancy', width: 20 },
      { header: 'Impacto Costo ($)', key: 'impact', width: 18 },
      { header: 'Estado', key: 'status', width: 18 },
      { header: 'Tipo Diferencia', key: 'diffType', width: 16 }
    ];

    // Estilo de encabezado de datos directos
    const directHeaderRow = wsDirect.getRow(1);
    directHeaderRow.height = 26;
    for (let c = 1; c <= 12; c++) {
      const cell = directHeaderRow.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_NAVY }
      };
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: true,
        color: { argb: COLOR_WHITE }
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: COLOR_EMERALD } }
      };
    }

    // Insertar filas
    tasks.forEach((t, i) => {
      const cost = Number(t.Cost || 0);
      const system = Number(t.SystemQuantity || 0);
      const sales = Number(t.SalesDuringAudit || 0);
      const theoretical = system - sales;
      const counted = t.CountedQuantity !== null && t.CountedQuantity !== undefined ? Number(t.CountedQuantity) : null;
      const discrepancy = Number(t.Discrepancy ?? 0);
      const impact = (t.Status === 'RECONCILED' || (t as any).Status === 'PARTIALLY_RECONCILED')
        ? 0
        : discrepancy * cost;

      let displayStatus: string = t.Status;
      if (t.Status === 'RECONCILED' || (t as any).Status === 'PARTIALLY_RECONCILED') displayStatus = 'TRASLADADO';
      if (t.Status === 'COMPLETED_MATCH') displayStatus = 'COINCIDENCIA EXACTA';
      if (t.Status === 'PENDING') displayStatus = 'PENDIENTE';
      if (t.Status === 'DISCREPANT') displayStatus = 'DISCREPANCIA';

      const diffType = discrepancy === 0 && counted !== null ? 'CUADRADO' : discrepancy < 0 ? 'FALTANTE' : discrepancy > 0 ? 'SOBRANTE' : 'PENDIENTE';

      const row = wsDirect.addRow({
        sku: t.SkuCode,
        description: t.SkuDescription,
        deposit: t.DepositCode || depositCode,
        cost: cost,
        system: system,
        sales: sales,
        theoretical: theoretical,
        counted: counted !== null ? counted : '',
        discrepancy: discrepancy,
        impact: impact,
        status: displayStatus,
        diffType: diffType
      });

      row.height = 20;

      // Formatos numéricos
      row.getCell(4).numFmt = '$#,##0.00';
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
      if (counted !== null) row.getCell(8).numFmt = '#,##0.00';
      row.getCell(9).numFmt = '+#,##0.00;-#,##0.00;0.00';
      row.getCell(10).numFmt = '$#,##0.00;($#,##0.00);"$0.00"';

      const rowBg = i % 2 === 0 ? COLOR_WHITE : COLOR_LIGHT_BG;
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.border = {
          bottom: { style: 'thin', color: { argb: COLOR_BORDER } }
        };
      }
    });

    // Auto-filtro en la tabla directa
    wsDirect.autoFilter = {
      from: 'A1',
      to: `L${tasks.length + 1}`
    };
  }

  // Generar buffer y disparar descarga
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const missionShortId = (missionId || 'mision').slice(0, 8);
  const modeSuffix = mode === 'executive' ? 'Ejecutivo' : mode === 'direct' ? 'Datos' : 'Completo';
  anchor.download = `AUDITORIAPLUS_${missionShortId}_${modeSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 2000);
}
