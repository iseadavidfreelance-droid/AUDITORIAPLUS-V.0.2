# Plan de Implementación: Ajuste Matemático de la Diferencia de Inventario post-Traslado

Actualizar la columna **Diferencia** en el **Detalle de Tareas de Inventario** (y en la base de datos `Read_Mission_Tasks`) para que al confirmar un traslado en el ERP, la diferencia física se compense algebraicamente (e.g. si había `-2` y se traslada `+2`, la diferencia pasa a `0.00`; si había `-3` y se traslada `+2`, la diferencia pasa a `-1.00`), utilizando exclusivamente las columnas existentes en el esquema (`Discrepancy` y `Status`).

---

## 1. Modificación en Edge Function `confirm-transfer` (`supabase/functions/confirm-transfer/index.ts`)

- **Obtener datos del traslado y la tarea**:
  - Obtener la cantidad de traslado (`TransferQuantity`), `FromDeposit` y `ToDeposit` desde `Read_Virtual_Transfers` (o el payload de entrada).
  - Consultar la tarea correspondiente en `Read_Mission_Tasks` para obtener su `Discrepancy` y `DepositCode` actuales.
- **Cálculo de la Diferencia Neta Compensada**:
  - Si la tarea tenía faltante (`Discrepancy < 0`) y recibe inventario:
    `newDiscrepancy = Math.min(0, currentDiscrepancy + transferQty)`. (Ejemplo: `-2 + 2 = 0`, `-3 + 2 = -1`).
  - Si la tarea tenía sobrante (`Discrepancy > 0`) y transfiere inventario hacia afuera:
    `newDiscrepancy = Math.max(0, currentDiscrepancy - transferQty)`.
- **Actualizar `Read_Mission_Tasks` en Supabase con Service Role**:
  ```ts
  await supabase
    .from('Read_Mission_Tasks')
    .update({
      Status: 'RECONCILED',
      Discrepancy: newDiscrepancy,
      UpdatedAt: nowIso
    })
    .eq('MissionId', mission_id)
    .eq('SkuCode', sku_code);
  ```
- **Retornar en la respuesta**:
  `{ success: true, transfer_id, status: 'COMPLETED', adjusted_discrepancy: newDiscrepancy }`.

---

## 2. Modificación en Zustand Store (`src/store/useMissionStore.ts`)

- **Actualizar `reconcileTaskAfterTransfer`**:
  - Aceptar `transferQty?: number`, `fromDeposit?: string`, `toDeposit?: string`.
  - Calcular la nueva `Discrepancy` compensada:
    - Si `transferQty` se provee:
      - Si `currentDiscrepancy < 0`: `newDiscrepancy = Number((Math.min(0, currentDiscrepancy + transferQty)).toFixed(2))`.
      - Si `currentDiscrepancy > 0`: `newDiscrepancy = Number((Math.max(0, currentDiscrepancy - transferQty)).toFixed(2))`.
    - Si no se provee o compensa exactamente: `newDiscrepancy = 0`.
  - Asignar tanto `task.Discrepancy = newDiscrepancy` como `task.discrepancy = newDiscrepancy` y `task.Status = 'RECONCILED'`.
  - Recalcular métricas de la misión invocando `calculateMetricsFromTasks`.

---

## 3. Modificación en `src/components/TabFloorReconciliation.tsx`

- **En `handleConfirmTransfer`**:
  - Al invocar `reconcileTaskAfterTransfer(skuCode, transferQty, fromDeposit, toDeposit)`, pasar la cantidad del traslado para actualizar el estado en memoria de inmediato.
  - Enviar `transfer_quantity: transferQty` en el payload a `supabase.functions.invoke('confirm-transfer', ...)`.
  - Al ejecutarse `fetchMissionTasks(activeMissionId)` a los 500ms, la base de datos devolverá el nuevo valor de `Discrepancy` (e.g. `0.00` o `-1.00`), garantizando consistencia absoluta en recargas.

---

## 4. Modificación en Reportes y Exportación (`src/components/TabReports.tsx` y `src/lib/exportExcel.ts`)

- **`TabReports.tsx`**:
  - En la tabla de **Detalle de Tareas de Inventario** y en el reporte imprimible, la celda Diferencia mostrará la diferencia compensada formateada con 2 decimales (`0.00`, `-1.00`, etc.) en verde si es 0.00 y en rojo si persiste remanente negativo.
- **`exportExcel.ts`**:
  - Asegurar que las hojas de Excel exporten el valor numérico ajustado en la columna de Diferencia con estado `TRASLADADO`.

---

## 5. Verificación
1. Probar compilación con `lint_applet` y `compile_applet`.
2. Verificar que un SKU con `-2` y traslado de `+2` pase a `0.00` con estado `TRASLADADO` e impacto financiero `$0.00`.
3. Verificar que un SKU con `-3` y traslado de `+2` pase a `-1.00` con estado `TRASLADADO`.
