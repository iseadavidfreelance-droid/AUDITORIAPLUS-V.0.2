# Sincronización Dinámica de Stock Teórico en Supabase y Autocierre de Cámara

Plan de diseño y arquitectura técnica para actualizar automáticamente el stock del sistema en Supabase y en el Detalle de Tareas con el valor en vivo obtenido de la API al registrar el conteo, permitir su edición en caso de fallo de red, y minimizar automáticamente la cámara tras la captura de un código.

## Decisiones Críticas y Confirmaciones del Usuario

> [!IMPORTANT]
> Decisiones confirmadas a través de la entrevista de alineación:
> - **Cierre de cámara tras lectura**: Al detectar un código mediante el visor, la cámara se detiene y minimiza inmediatamente, manteniéndose cerrada hasta que el auditor pulse nuevamente el botón de cámara.
> - **Actualización bidireccional del stock del sistema**: Si al escanear un SKU la API retorna una cantidad vigente en almacén (ej. 12 u frente a 20 u iniciales), al registrar el conteo el valor de 20 u se reemplaza permanentemente tanto en el estado local como en la base de datos de Supabase (`Read_Mission_Tasks.SystemQuantity`), recalculando la discrepancia real y reflejándose al instante en el Detalle de Tareas y reportes Excel.
> - **Gestión de fallos de red / API**: En ausencia de conexión con el ERP o internet, se conserva el stock previo del sistema pero se habilita un control de edición asistido para que el auditor pueda corregir o ajustar manualmente la cantidad teórica de sistema si es necesario.

---

### 1. Resumen y Concepto General

- **Qué resuelve**: Elimina la inconsistencia de auditoría generada cuando el inventario base inicial (ej. 20 u) queda obsoleto frente a los movimientos de almacén reflejados por el ERP en tiempo real (ej. 12 u). Garantiza que tanto la conciliación operativa como la base de datos relacional de Supabase queden alineadas con la realidad física y digital al momento exacto de la auditoría.
- **Experiencia de escaneo**: Automatiza el flujo ergonómico en dispositivos móviles: una vez que el auditor apunta y captura un código de barras o QR, la cámara se apaga y oculta instantáneamente para liberar espacio en pantalla y enfocar de inmediato el campo de cantidad contada, evitando lecturas continuas o sobrecalentamiento.
- **Audiencia y Contexto**: Auditores de inventario y jefes de almacén en galpones y centros de distribución con o sin conectividad estable.

---

### 2. Experiencia de Usuario y Diseño Visual

#### Flujo de Usuario Paso a Paso

1. **Lectura Inteligente con Cámara**:
   - El auditor activa la cámara pulsando el botón de escaneo.
   - Apunta al código del producto. En cuanto la cámara reconoce el código de barras/QR (vibración háptica de confirmación):
     - El visor de la cámara se **detiene y minimiza inmediatamente** a su estado cerrado.
     - La interfaz resalta la tarjeta de conteo y coloca el foco en el input de cantidad física contada.
2. **Consulta en Tiempo Real e Indicador de Stock Actualizado**:
   - En paralelo a la detección, el interceptor consulta la API de inventario en vivo (`/api/inventory?search={sku}`).
   - Si la API responde con éxito (ej. stock actual: 12 u cuando antes había 20 u):
     - La cantidad de sistema pasa de 20 u a 12 u con un badge verde de "Actualizado en ERP".
     - Se ajusta la cantidad teórica base para el cálculo de discrepancia en tiempo real.
3. **Modo Sin Conexión / Edición Asistida de Stock de Sistema**:
   - Si la consulta al ERP falla o el dispositivo está desconectado:
     - Se mantiene el stock de sistema previamente almacenado en base de datos.
     - Aparece un control de ajuste rápido (botón de edición o input asistido de "Stock Sistema") que permite al auditor modificar la cantidad teórica en caso de contar con una nota de ajuste física o directiva de almacén.
4. **Registro y Persistencia en Supabase**:
   - El auditor introduce la cantidad contada y pulsa **REGISTRAR CONTEO AUDITORÍA**.
   - El sistema:
     - Actualiza `Read_Mission_Tasks` en Supabase con la nueva `SystemQuantity` (12 u), la `CountedQuantity` y el nuevo estado/discrepancia.
     - Actualiza el almacén local IndexedDB y el Store global Zustand.
     - Encola el payload con la nueva `system_quantity` en `offline_events_queue` si se trabaja sin internet para sincronización transparente.
5. **Detalle de Tareas de Inventario y Exportaciones**:
   - Al consultar la pestaña de Reportes y Detalle de Tareas, el registro del SKU ya no muestra 20 u; muestra las 12 u vigentes, con su discrepancia correcta frente a lo contado y con el cálculo exacto de costo.
   - Las exportaciones a Excel estilizado reflejan fielmente las 12 u actualizadas en la columna "Sistema (S)".

#### Tokens de Diseño Aplicados (Paleta Corporativa AUDITORIAPLUS+)

- **Verde Esmeralda (`#009045`)**: Badge de stock verificado en vivo, botón primario de registro y badges de cuadratura exacta.
- **Azul Marino Profundo (`#263988`)**: Controles de edición manual de stock de sistema, iconos de trazabilidad e indicadores principales.
- **Ámbar / Discrepancia (`#F59E0B`)**: Alerta de discrepancia y estado de consulta sin conexión.
- **Rojo Alerta (`#DC2626`)**: Indicador de faltantes.
- **Bordes e Inputs**: `8px` de radio con elevación estándar de tarjetas (`box-shadow: 0 4px 12px rgba(38, 57, 136, 0.08)`).

---

### 3. Decisiones de Producto y Arquitectura

#### Decisión 1: Minimizador Reactivo de Cámara vs. Retardo Manual
- **Enfoque adoptado**: Apagado y colapso atómico inmediato del componente `Html5Qrcode` en el callback `onScanSuccess`.
- **Justificación**: En la práctica de almacén, mantener la cámara abierta tras capturar un producto consume batería, recalienta el dispositivo móvil y provoca lecturas accidentales de productos contiguos en la estantería.
- **Alternativas descartadas**: Dejar la cámara en pausa con un botón de cerrar manual obligaba al auditor a hacer un tap innecesario en cada SKU.

#### Decisión 2: Actualización Persistente de `SystemQuantity` en Supabase
- **Enfoque adoptado**: Al despachar la Edge Function `register-count` o al ejecutar el fallback directo en Supabase (`Read_Mission_Tasks`), se incluye explícitamente `SystemQuantity: payload.system_quantity`.
- **Justificación**: Si un SKU tenía 20 u registradas en la ingesta inicial pero al momento de la auditoría el ERP certifica que hay 12 u, conservar 20 u falsearía los reportes contables, los traslados al depósito 150104 y las métricas de merma. La auditoría debe congelar la cantidad de sistema vigente al momento del escaneo.
- **Alternativas descartadas**: Guardar el valor nuevo sólo en una variable temporal de memoria; esto provocaba que al recargar la página o emitir el Excel reaparecieran las 20 u originales desfasadas.

#### Decisión 3: Modo Contingencia con Edición Manual de Stock de Sistema
- **Enfoque adoptado**: Si no hay conexión o la API no responde, se mantiene la cantidad base previa, pero se desbloquea un interruptor de edición rápida con confirmación para sobreescribir el stock de sistema si el auditor lo necesita.
- **Justificación**: Cumple estrictamente la directiva del usuario asegurando la continuidad operativa en zonas sin cobertura o fallos temporales de red local.

---

### 4. Arquitectura Técnica y Estrategia de Datos

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             FLUJO DE CAPTURA Y PERSISTENCIA                      │
└──────────────────────────────────────────────────────────────────────────────────┘

   [ Lector Cámara Trasera ]  ───> Detecta Código ───> 1. Inmediato: stopCameraScanner()
                                                              │  (Cierra y oculta visor)
                                                              ▼
                                                    2. Consulta ERP (/api/inventory)
                                                              │
                     ┌────────────────────────────────────────┴────────────────────────────────────────┐
                     ▼                                                                                 ▼
          [ Conexión ERP Exitosa ]                                                        [ Sin Conexión ERP ]
          - Obtiene Stock Vivo (ej. 12 u)                                                 - Mantiene Stock Previo (20 u)
          - Activa Badge "ERP Actualizado"                                                - Habilita Edición Manual asistida
                     │                                                                                 │
                     └────────────────────────────────────────┬────────────────────────────────────────┘
                                                              ▼
                                              3. Auditor Ingresa Conteo Físico
                                                              │
                                                              ▼
                                            4. handleRegisterCount()
                                                              │
                     ┌────────────────────────────────────────┴────────────────────────────────────────┐
                     ▼                                                                                 ▼
           [ Zustand Store & Cache ]                                                    [ Supabase & Offline Queue ]
       - updateTaskCountLocally:                                                     - Supabase Edge Function / Direct DB:
         * SystemQuantity = 12 u                                                       * SystemQuantity = 12 u
         * CountedQuantity = Qc                                                        * CountedQuantity = Qc
         * Discrepancy recalculada                                                     * Discrepancy & Status actualizados
       - IndexedDB: cacheMissionData()                                               - Si offline: encola en offline_events_queue
                     │                                                                                 │
                     └────────────────────────────────────────┬────────────────────────────────────────┘
                                                              ▼
                                            5. Detalles de Tareas & Excel
                                   - Muestra 12 u en columna "Sistema (S)"
                                   - Discrepancia real auditada
                                   - Reporte Excel (.xlsx) sincronizado
```

#### Mapeo de Entidades y Estado

1. **`useMissionStore.ts`**:
   - Ampliación de `updateTaskCountLocally(skuCode, countedQty, salesQty, explicitDiscrepancy, explicitStatus, updatedSystemQty)` para actualizar `SystemQuantity` y `systemQuantity` tanto en la tarea como en `activeTask` y recalcular métricas generales.
2. **`TabCollector.tsx`**:
   - En `startCameraScanner`: invocar `stopCameraScanner()` al decodificar un código exitoso.
   - En la tarjeta teórica: habilitar estado de `isEditingSystemQty` y control manual cuando no haya stock en vivo de API o se requiera ajuste.
   - En `handleRegisterCount`: despachar `finalSystemQty` hacia Supabase (`Read_Mission_Tasks`), actualizando `SystemQuantity` directamente en la base de datos PostgreSQL y en la cola IndexedDB.
3. **`sync.ts`**:
   - Actualización del procesador de cola offline para que al sincronizar `register-count` actualice también la columna `SystemQuantity` en `Read_Mission_Tasks`.
4. **`TabReports.tsx`**:
   - La tabla "Detalles de Tareas de Inventario" y la exportación Excel consumen automáticamente las tareas con su `SystemQuantity` ya actualizado.
