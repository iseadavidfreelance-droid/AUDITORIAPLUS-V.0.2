# AUDITORIAPLUS+ v.0.4 (PRIME) - Documentación Técnica y Funcional

PWA de Auditoría de Inventario Físico, Reconciliación Asíncrona de Piso de Ventas y Traslados Virtuales con Arquitectura CQRS sobre Supabase.

---

## 1. Visión General del Sistema

**AUDITORIAPLUS+** es una Progressive Web App (PWA) de nivel industrial diseñada para optimizar los conteos de inventario físico en cadenas de tiendas y centros de distribución. Opera bajo una arquitectura **CQRS (Command Query Responsibility Segregation)** con **Event Sourcing**, garantizando:

- **Operación Continua Offline-First**: Conteo ininterrumpido en pasillos o galpones sin cobertura Wi-Fi mediante IndexedDB (`AuditDB`) y cola FIFO de sincronización en segundo plano.
- **Trazabilidad Inmutable**: Registro de cada acción operativa (conteos, discrepancias, cancelaciones, traslados) en la tabla `EventStore` de PostgreSQL.
- **Doble Conteo y Re-auditoría Blindada**: Bloqueo preventivo de artículos ya contados con sello de auditor, fecha/hora exacta y modal de confirmación expresa para re-conteo.
- **Reconciliación Bidireccional Asíncrona**: Detección automática de faltantes en almacén compensados por sobrantes en piso de venta, generando traslados virtuales entre depósitos.
- **Interceptor ERP en Tiempo Real**: Consulta en vivo de existencias físicas a la API del ERP Maraplus (`https://192.168.15.225:3002/api/inventory`), con timeout estricto de 1.5s y degradación suave al stock teórico de la misión.

---

## 2. Arquitectura de Datos y Event Sourcing

```
                                  [ INTERFAZ PWA (React 19) ]
                                               │
                   ┌───────────────────────────┴───────────────────────────┐
                   │ (Online)                                              │ (Offline)
                   ▼                                                       ▼
      [ Supabase Edge Functions ]                                [ IndexedDB: AuditDB ]
                   │                                             (offline_events_queue)
                   │                                                       │
                   ▼ (Event Sourcing)                                      ▼ (Reconexión FIFO)
         ┌───────────────────┐                                             │
         │    EventStore     │ ◄───────────────────────────────────────────┘
         │  (Log Inmutable)  │
         └─────────┬─────────┘
                   │ Proyecciones Asíncronas (Read Models)
                   ▼
     ┌────────────────────────────────────────────────────────────────────────┐
     │  Read_Missions            │  Read_Mission_Tasks                        │
     │  Read_Floor_Discrepancies │  Read_Virtual_Transfers                    │
     │  Read_Users_Gamification  │  Read_IngestionLogs                        │
     └────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Tablas Principales

| Tabla / Entidad | Rol Arquitectónico | Descripción |
|---|---|---|
| `EventStore` | **Write Model (Single Source of Truth)** | Almacén inmutable de eventos con `EventId` (UUID RFC4122 v4), `SequenceNum`, `EventType`, `AggregateId`, `Payload` JSON y `UserId`. |
| `Read_Missions` | Read Model | Resumen global de la auditoría activa (`TotalSkus`, `CountedSkus`, `PendingSkus`, `DiscrepantSkus`, `ReconciledSkus`, `TotalCostDiscrepancy`). |
| `Read_Mission_Tasks` | Read Model | Inventario maestro cargado: Códigos de barra, costo unitario, stock teórico (`SystemQuantity`), conteo físico (`CountedQuantity`) y estado. |
| `Read_Floor_Discrepancies` | Read Model | Discrepancias originadas en almacén pendientes de contrastación física en piso de venta. Estados: `OPEN`, `PENDING_TARGET_COUNT`, `RESOLVED`, `CANCELADA`. |
| `Read_Virtual_Transfers` | Read Model | Movimientos compensatorios sugeridos o ejecutados entre depósitos (`150101` $\leftrightarrow$ `150103` vía `150104`). Estados: `SUGGESTED`, `COMPLETED`. |
| `Read_Users_Gamification` | Read Model | Perfiles de usuario, roles (`admin` / `auditor`) y puntos de experiencia. |
| `Read_IngestionLogs` | Auditoría de Carga | Registro de archivos Excel ingeridos con huella criptográfica SHA-256. |

---

## 3. Catálogo Oficial de Supabase Edge Functions

Ubicadas en `/supabase/functions/`, ejecutadas bajo Deno runtime con cabeceras CORS permisivas para la PWA:

### 3.1 `confirm-transfer`
- **Ruta**: `/functions/v1/confirm-transfer`
- **Propósito**: Ejecuta la confirmación humana de un traslado sugerido tras validar existencias físicas entre depósitos.
- **Payload Request**:
  ```json
  {
    "transfer_id": "uuid-del-traslado",
    "mission_id": "uuid-de-la-mision",
    "sku_code": "000123",
    "user_id": "uuid-del-auditor"
  }
  ```
- **Acciones Transaccionales**:
  1. Inserta en `EventStore`: `EventType: 'VirtualTransferExecuted'`, `EventId: UUID`, `Timestamp: nowIso`, `Version: 1`, `status: 'COMPLETED'`, omitiendo `SequenceNum` para permitir autoincremento nativo correlativo de PostgreSQL.
  2. Actualiza atómicamente en `Read_Virtual_Transfers`: `Status: 'COMPLETED'`, `UpdatedAt: nowIso`.
  3. Si la actualización falla, retorna **HTTP 500** para impedir confirmaciones falsas.
  4. Actualiza en `Read_Floor_Discrepancies`: `Status: 'RESOLVED'`, `UpdatedAt: nowIso` (sin campo `ResolvedAt` para total conformidad con el esquema).
  5. Actualiza en `Read_Mission_Tasks`: compensa algebraicamente `Discrepancy` según la cantidad trasladada (e.g. si había `-2` y se traslada `+2`, pasa a `0.00`; si había `-3` y se traslada `+2`, pasa a `-1.00`) y fija `Status: 'RECONCILED'` (reflejado en UI y reportes como `"TRASLADADO"`).
- **Respuesta Exitosa (HTTP 200)**:
  ```json
  { "success": true, "transfer_id": "...", "status": "COMPLETED", "adjusted_discrepancy": 0.0 }
  ```

### 3.2 `register-count`
- **Ruta**: `/functions/v1/register-count`
- **Propósito**: Registra el conteo físico en origen (Almacén 150101 o Piso 150103) y calcula discrepancias en tiempo real.
- **Payload Request**:
  ```json
  {
    "mission_id": "uuid-mision",
    "task_id": "uuid-tarea",
    "deposit_code": "150101",
    "sku_code": "000123",
    "sku_description": "NOMBRE DEL PRODUCTO REAL",
    "counted_quantity": 12.0,
    "system_quantity": 10.0,
    "sales_during_audit": 0,
    "user_id": "uuid-auditor",
    "target_deposit": "150103",
    "target_system_quantity": 5.0
  }
  ```
- **Acciones Transaccionales**:
  1. Inserta en `EventStore`: `EventType: 'TaskCountRegistered'` (omitiendo `SequenceNum` para secuencia nativa PostgreSQL).
  2. Si `calculated_discrepancy !== 0`: inserta `EventType: 'DiscrepancyDetected'` con UUID válido en `discrepancy_id`, `sku_description` real del producto, y persiste en `Read_Floor_Discrepancies` en estado `PENDING_TARGET_COUNT`.
  3. Si `calculated_discrepancy === 0` (re-conteo exacto que cuadró el inventario): emite `EventType: 'DiscrepancyCancelled'` (`reason: 'RECOUNT_MATCH_ZERO_DISCREPANCY'`) y pasa la discrepancia en `Read_Floor_Discrepancies` a estado `CANCELADA`.
- **Respuesta Exitosa (HTTP 200)**:
  ```json
  {
    "status": "success",
    "code": 200,
    "data": {
      "task_id": "...",
      "calculated_discrepancy": 0,
      "status": "COMPLETED_MATCH"
    }
  }
  ```

### 3.3 `register-floor-count`
- **Ruta**: `/functions/v1/register-floor-count`
- **Propósito**: Registra el conteo de contraste en el depósito destino para verificar o balancear una discrepancia.
- **Payload Request**:
  ```json
  {
    "discrepancy_id": "uuid-discrepancia",
    "mission_id": "uuid-mision",
    "sku_code": "000123",
    "sku_description": "NOMBRE DEL PRODUCTO REAL",
    "origin_deposit": "150101",
    "target_deposit": "150103",
    "origin_discrepancy": -2.0,
    "target_counted_quantity": 7.0,
    "target_system_quantity": 5.0,
    "user_id": "uuid-auditor"
  }
  ```
- **Acciones Transaccionales**:
  1. Inserta en `EventStore`: `EventType: 'FloorCountRegistered'` con `EventId` UUID v4, `Timestamp: nowIso`, `Version: 1` y `SequenceNum` nativo.
  2. Si el faltante en origen coincide con un sobrante en destino, calcula la cantidad de compensación y emite `EventType: 'VirtualTransferCreated'` generando un traslado sugerido en `Read_Virtual_Transfers` con estado `SUGGESTED`.
  3. Actualiza el estado en `Read_Floor_Discrepancies` a `PENDING_TRANSFER_APPROVAL` o `RESOLVED`.

### 3.4 `ingest-excel`
- **Ruta**: `/functions/v1/ingest-excel`
- **Propósito**: Procesa hojas maestras de inventario (.xlsx/.csv), valida integridad, extrae códigos de barra y genera las tareas individuales de conteo para la misión.

### 3.5 `reports-pdf`
- **Ruta**: `/functions/v1/reports-pdf`
- **Propósito**: Genera el binario oficial del reporte consolidado de auditoría en formato PDF descargable directamente.

---

## 4. Estandarización de Depósitos

Centralizado en `src/lib/deposits.ts`:

```typescript
export const DEPOSIT_CODES = {
  WAREHOUSE: '150101', // Almacén Principal
  FLOOR: '150103',     // Piso de Venta
} as const;

export const DEPOSIT_NAMES: Record<string, string> = {
  '150101': 'ALMACÉN',
  '150103': 'PISO DE VENTAS',
};

// Formato visual amigable para operadores:
// formatDepositLabel('150101') => "ALMACÉN (150101)"
// formatDepositLabel('150103') => "PISO DE VENTAS (150103)"
```

---

## 5. Módulos de la Aplicación

### 5.1 TabCollector (`src/components/TabCollector.tsx`)
- **Escáner Óptico Híbrido**: `Html5Qrcode` con cámara trasera (`facingMode: 'environment'`), retícula láser verde animada, alternancia de linterna/flash (`torch`) y auto-cierre tras escaneo exitoso con debounce de 1200ms.
- **Entrada Manual & Colectores Industriales**: Normalización LPAD automática a 6 dígitos (`000123`) y disparo automático con debounce de 280ms al escribir o capturar por láser físico más de 3 dígitos.
- **Interceptor ERP en Vivo**:
  - Consulta paralela con `AbortController` (timeout estricto de 1.5s) a `https://192.168.15.225:3002/api/inventory?search=${sku}`.
  - Extrae stock en vivo de origen y destino.
  - Pre-llena el input físico si el producto no ha sido contado.
- **Edición en Línea de Existencia en Sistema (S)**: Permite ajustar manualmente la cantidad teórica en caso de desfase administrativo justificado.
- **Teclado Táctil Inteligente ERP**: 6 botones ergonómicos de $\ge 50\text{px}$ centrados en el valor teórico: `-2`, `-1`, `Exacto ERP`, `+1`, `+2` y `0 / Cero`.
- **Blindaje Anti-Doble Conteo**:
  - Si el producto ya fue auditado, bloquea el formulario con una tarjeta fija amarilla (`PRODUCTO YA CONTADO EN ORIGEN`).
  - Muestra quién lo contó (`auditorName`), fecha y hora formateada (`formatAuditDate`), y el balance registrado.
  - Botón `"VOLVER A CONTAR (RE-AUDITORÍA)"` con modal de confirmación obligatoria.

### 5.2 TabFloorReconciliation (`src/components/TabFloorReconciliation.tsx`)
- Lista de discrepancias pendientes con etiquetas de depósito estandarizadas.
- **Descarte de Discrepancias Falsas**: Botón de papelera (`Trash2`) con modal para cancelar registros erróneos, emitiendo el evento `DiscrepancyCancelled` (`reason: 'MANUAL_DISCARD_BY_AUDITOR'`).
- **Verificación en Destino**: Interceptor ERP para comprobar existencias en el depósito destino y contraste contra el conteo físico del auditor.
- **Confirmación de Traslados en ERP**: Modal corporativo para validar y registrar movimientos físicos entre almacén y piso.

### 5.3 TabReports (`src/components/TabReports.tsx`)
- **Impacto Financiero Reactivo**: Cálculo mediante `useMemo` recorriendo las tareas activas `Math.abs(sum(Discrepancia * Costo))` inmune a sobreescrituras por sondeos de red.
- **Filtros Avanzados**: Por tipo de diferencia (*Todos*, *Faltantes*, *Sobrantes*, *Cuadrados*) y estado de reconciliación.
- **Normalización de Traslados**: Tabla de traslados ejecutados que normaliza estados a mayúsculas aceptando tanto `COMPLETED` como `EXECUTED`.
- **Exportación Dual**: Descarga de reportes detallados en Excel (.xlsx) estilizado corporativamente y generación de PDF.

### 5.4 useMissionStore (`src/store/useMissionStore.ts`)
- Store global en Zustand blindado contra el sondeo cada 15s de `App.tsx`:
  - Si existen tareas en memoria (`state.tasks.length > 0`), calcula reactivamente las métricas (`calculateMetricsFromTasks`).
  - Preserva `safeCost` y asigna con prioridad los datos en memoria tanto a `metrics` como a `activeMission`.

---

## 6. Motor Offline-First (AuditDB)

Centralizado en `src/lib/db.ts` y `src/lib/sync.ts`:
- **IndexedDB `AuditDB`**: Versión 1 con almacenes `offline_events_queue` y `missions_cache`.
- **UUIDs RFC4122 v4**: Generación con fallback transparente para `eventId` sin prefijos artificiales (`evt_`), cumpliendo con el tipo `uuid` estricto de PostgreSQL.
- **Sincronización FIFO**: Monitor de conectividad (`navigator.onLine`) que procesa la cola local cronológicamente al restaurarse la conexión a internet.
