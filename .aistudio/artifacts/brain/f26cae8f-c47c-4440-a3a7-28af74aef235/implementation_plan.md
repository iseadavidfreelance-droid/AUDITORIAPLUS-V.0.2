# Plan de Implementación: Optimizaciones Operativas, Cancelación de Discrepancias Falsas y Teclado ERP

Este plan aborda las mejoras operativas solicitadas para maximizar la velocidad de auditoría en colectores Android y smartphones, garantizando la consistencia del modelo CQRS y el esquema Supabase (`Read_Floor_Discrepancies`, `Read_Mission_Tasks`, `Read_Virtual_Transfers` y `EventStore`).

---

## 1. User Review Required (Puntos Clave y Decisiones)

> [!IMPORTANT]
> - **Escaneo Automático en Colectores Android**: Se implementa detección dual en el campo de búsqueda: captura instantánea de la tecla `Enter` emitida por lectores hardware (wedge de teclado) y debounce automático de 280ms cuando se ingresa o pega un código completo (evitando tener que presionar manualmente el botón "Buscar").
> - **Cancelación Automática de Discrepancias Resueltas**: Si un producto tenía una discrepancia pendiente en piso y luego en un re-conteo se concilia a diferencia 0 (o el stock cuadrado), la discrepancia en `Read_Floor_Discrepancies` pasará automáticamente a estado `CANCELADA` y se emitirá el evento correspondiente en `EventStore`.
> - **Borrado Manual de Discrepancias Falsas con Modal**: En la pestaña Discrepancias, cada tarjeta incluirá un botón para descartar/eliminar la discrepancia. No se usará `window.confirm`, sino un modal estilizado con el look & feel de la app. La discrepancia pasará a estado `CANCELADA` en Supabase y se ocultará de la lista de pendientes.
> - **Preconteo y Botones Centrados en ERP**: Si el ERP indica por ejemplo 10 unidades, el campo numérico vendrá pre-llenado con 10 y los botones rápidos táctiles mostrarán los valores directos: `[8]`, `[9]`, `[10]`, `[11]`, `[12]` (calculados como `ERP - 2`, `ERP - 1`, `ERP`, `ERP + 1`, `ERP + 2`).
> - **Modal Estilizado para Aprobación de Traslados**: Se reemplaza el `window.confirm` nativo del navegador por un modal nativo en React con tipografía, tarjetas de depósito con badges y confirmación visual clara.
> - **Nombres de Depósitos**: `150101` se mostrará como **ALMACÉN (150101)** y `150103` como **PISO DE VENTAS (150103)** en todas las tarjetas y modales.

---

## 2. Proposed Changes

### Módulo de Utilidades de Depósitos
#### `src/lib/deposits.ts`
* Crear función utilitaria `formatDepositLabel(code)`:
  * `'150101'` &rarr; `ALMACÉN (150101)`
  * `'150103'` &rarr; `PISO DE VENTAS (150103)`
  * Otros &rarr; `DEP. {code}`

---

### Escaneo Automático y Teclado Centrado en ERP
#### `src/components/TabCollector.tsx`
1. **Detección Automática de Colector de Datos**:
   * En el input de SKU (`scannerInputRef`), agregar listener `onKeyDown` para detectar la tecla `Enter` enviada por el láser del colector y disparar `processDetectedCode` inmediatamente sin esperar clic.
   * Agregar efecto con debounce (280ms) en `searchTerm`: cuando se ingresa un código con longitud $\ge 3$ de manera continua o mediante escaneo rápido, ejecutar automáticamente la búsqueda y limpiar el término sin requerir pulsar "Buscar".
2. **Pre-conteo Automático**:
   * Al escanear un SKU y obtener la cantidad teórica del ERP (o de la misión si offline), si la tarea no estaba contada previamente (o en modo re-conteo), pre-escribir el valor teórico en `countedInput` y enfocar el campo con selección de texto para confirmación inmediata.
3. **Teclado Táctil Centrado en ERP**:
   * Reemplazar los botones genéricos `+1, +5, +10, +25, -1` por 5 botones inteligentes calculados sobre `finalSystemQty`:
     * Botón `ERP - 2`: ej. `8` (o `0` si menor a 0)
     * Botón `ERP - 1`: ej. `9` (o `0` si menor a 0)
     * Botón `ERP` (Exacto): ej. `10` con destacado visual (borde verde esmeralda y etiqueta de coincidencia)
     * Botón `ERP + 1`: ej. `11`
     * Botón `ERP + 2`: ej. `12`
     * Botón extra `0` o reset para casos de faltante total.
4. **Cancelación Automática de Discrepancia al Conciliar SKU**:
   * En `handleRegisterCount`, si el resultado del re-conteo es `discrepancy === 0`:
     * Consultar y actualizar en `Read_Floor_Discrepancies` cualquier registro con `MissionId = activeMissionId` y `SkuCode = skuCodeToUse` cuyo estado sea `PENDING_TARGET_COUNT` o `OPEN` a `CANCELADA`.
     * Registrar evento en `EventStore`: `DiscrepancyCancelled` con metadata de auditoría.
     * Actualizar el store local `useDiscrepancyStore` para reflejar la cancelación de inmediato.

---

### Cancelación Manual y Modal Estilizado de Traslados
#### `src/components/TabFloorReconciliation.tsx`
1. **Eliminación / Descarte de Discrepancia Falsa (Estado CANCELADA)**:
   * En cada tarjeta de "Pendientes por Verificar", agregar un botón de acción rápida con icono `<Trash2 />` / `<X />` titulado "Descartar / Cancelar Discrepancia".
   * Crear estado `discrepancyToCancel: FloorDiscrepancy | null`.
   * Al presionar, abrir modal estilizado con advertencia: "¿Desea cancelar esta discrepancia? La discrepancia para el SKU {código} pasará a estado CANCELADA y se excluirá de las tareas pendientes."
   * Al confirmar:
     * Actualizar `Read_Floor_Discrepancies`: `Status: 'CANCELADA'`, `ResolvedAt: nowIso`.
     * Registrar evento en `EventStore`: `EventType: 'DiscrepancyCancelled'`.
     * Remover de `pendingFloorDiscrepancies` y notificar mediante toast estilizado.
2. **Reemplazo de `window.confirm` por Modal Estilizado de Aprobación de Traslado**:
   * Eliminar `window.confirm(...)` en `handleApproveTransfer`.
   * Crear estado `transferToConfirm: any | null`.
   * Renderizar un modal nativo en React con:
     * Título: "Confirmar Traslado en ERP".
     * Resumen: SKU, descripción, cantidad a mover.
     * Origen y Destino con nombres descriptivos: `ALMACÉN (150101) → PISO DE VENTAS (150103)`.
     * Botones "Cancelar" y "Confirmar Traslado ERP".
3. **Nombres Descriptivos de Depósito**:
   * En las tarjetas de discrepancias, en el panel de verificación y en los traslados sugeridos, reemplazar códigos puros por `formatDepositLabel` (`ALMACÉN (150101)` y `PISO DE VENTAS (150103)`).

---

## 3. Verification Plan

### Verificación Automatizada
1. `compile_applet`: Verificar compilación de Vite y bundles sin errores de sintaxis o tipos.
2. `lint_applet`: Asegurar cero errores de linter y tipado estricto en TypeScript.

### Verificación Manual de Flujos
1. **Escaneo en Colector**:
   * Ingresar un código de barras simulando lector o escribir con enter: el SKU debe cargarse de inmediato sin necesidad de hacer clic en "Buscar".
2. **Preconteo y Botones ERP**:
   * Al cargar un SKU con existencia teórica de 10: verificar que el input muestra `10` y los botones rápidos muestran `8`, `9`, `10`, `11`, `12`.
   * Tocar el botón `9`: el input debe actualizarse a `9` y mostrar la discrepancia `-1.00`.
3. **Cancelación Automática de Discrepancia**:
   * Registrar un SKU con discrepancia (ej. faltante -1). Aparece en "Discrepancias".
   * Volver a la pestaña Conteo, re-auditar el SKU e ingresar la cantidad exacta igual al ERP.
   * Verificar que en "Discrepancias" la discrepancia ya no figura como pendiente (pasa a `CANCELADA`).
4. **Descarte Manual de Discrepancia**:
   * En una discrepancia pendiente, hacer clic en el botón de eliminar: debe abrirse el modal estilizado (sin alertas nativas del navegador).
   * Confirmar la cancelación: la tarjeta debe desaparecer y actualizarse en Supabase.
5. **Aprobación de Traslado Estilizada**:
   * En "Traslados Sugeridos", pulsar "Confirmar ERP": debe abrirse el modal estilizado mostrando `ALMACÉN (150101)` y `PISO DE VENTAS (150103)` sin alertas nativas.
