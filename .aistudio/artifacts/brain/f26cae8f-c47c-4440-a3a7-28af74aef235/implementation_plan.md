# Diagnóstico y Plan de Corrección: Supabase, Edge Functions y Arquitectura de Datos

1-2 oraciones que resumen el objetivo general:
Diagnóstico exhaustivo y plan de solución para los 4 errores operativos en la integración con Supabase y Edge Functions (error de esquema `ResolvedAt`, colisión de clave única en `EventStore`, sincronización de traslados virtuales confirmados en Reportes, y visualización inestable del Impacto Financiero en Costo).

---

## Decisiones Críticas Confirmadas

> [!IMPORTANT]
> Decisiones operativas y de arquitectura acordadas con el usuario para mantener estricta fidelidad con el esquema de `/docs/estructura_supabase_actualizada.ts`:

- **Decisión 1 (Error PGRST204 en Discrepancias)**: Se mantendrá intacto el esquema de `Read_Floor_Discrepancies` sin añadir columnas adicionales. Se retirará cualquier referencia a `ResolvedAt` en el código cliente y se utilizará exclusivamente `Status: 'CANCELADA'` (o `'RESOLVED'`) junto con `UpdatedAt: ISOString`.
- **Decisión 2 (Error 23505 en EventStore al Contar)**: El Frontend actualizará directamente las tablas de lectura (`Read_Mission_Tasks` y `Read_Floor_Discrepancies`) para una respuesta visual instantánea, mientras que la Edge Function `register-count` será la responsable única de registrar el evento inmutable en `EventStore`, inyectando `EventId: crypto.randomUUID()` y `Timestamp` garantizando unicidad absoluta sin colisiones de clave primaria.
- **Decisión 3 (Estandarización de Traslados Confirmados)**: Se estandariza el estatus `COMPLETED` tanto en la base de datos `Read_Virtual_Transfers`, en el payload del evento de la Edge Function `confirm-transfer`, como en el filtro de la pestaña Reportes (con tolerancia a `EXECUTED` para retrocompatibilidad).
- **Decisión 4 (Impacto en Costo Robusto)**: El KPI financiero se calculará en tiempo real y reactivamente a partir de los SKUs cargados (`sum(Discrepancy * Cost)`), evitando que el sondeo periódico de 15 segundos sobreescriba el valor con ceros o nulos provenientes de `Read_Missions`.

---

## 1. Análisis Causa-Raíz de los 4 Problemas

### Problema 1: `PGRST204 - Could not find the 'ResolvedAt' column of 'Read_Floor_Discrepancies'`
* **Causa**: Según `/docs/estructura_supabase_actualizada.ts`, la tabla `Read_Floor_Discrepancies` posee únicamente: `DiscrepancyId`, `MissionId`, `OriginDeposit`, `OriginDiscrepancy`, `SkuCode`, `SkuDescription`, `Status`, `TargetCountedQuantity`, `TargetDeposit`, `TargetDiscrepancy`, `TargetSystemQuantity`, `CreatedAt` y `UpdatedAt`. En `TabCollector.tsx` (línea 593) y `TabFloorReconciliation.tsx` (línea 380) se enviaba el campo `ResolvedAt: nowIso`, disparando el rechazo inmediato de la API de PostgREST.
* **Solución**: Limpiar el payload de actualización a únicamente `{ Status: 'CANCELADA', UpdatedAt: nowIso }`.

### Problema 2: `23505 - duplicate key value violates unique constraint "EventStore_pkey"`
* **Causa**:
  1. `TabCollector.tsx` estaba realizando **doble escritura**: primero insertaba directamente en `EventStore` desde el cliente con `SequenceNum: 1, Version: 1` y luego invocaba `register-count`.
  2. En `register-count/index.ts`, la Edge Function insertaba en `EventStore` **sin** especificar un `EventId` explícito con UUID (`crypto.randomUUID()`), dejando el campo a merced del valor por defecto de Postgres o generando colisiones si se realizaba un re-conteo sobre la misma tarea.
* **Solución**:
  - Eliminar la inserción duplicada en `TabCollector.tsx` previa a la Edge Function.
  - Asegurar que `register-count/index.ts` siempre asigne `EventId: crypto.randomUUID()`, `Timestamp: new Date().toISOString()`, `SequenceNum: Date.now()`, y `Version: 1`.

### Problema 3: Traslados Virtuales Confirmados no aparecen en Reportes
* **Causa**:
  1. En `TabFloorReconciliation.tsx` (líneas 486-494), existía una condición invertida:
     ```ts
     if (eventError) {
       await supabase.from('Read_Virtual_Transfers').update({ Status: 'COMPLETED' })
     }
     ```
     ¡Solo actualizaba `Read_Virtual_Transfers` si la inserción en `EventStore` fallaba! En el flujo exitoso normal, `Read_Virtual_Transfers` jamás se actualizaba a `COMPLETED` en Supabase.
  2. La función Edge `confirm-transfer/index.ts` solo insertaba un evento en `EventStore` con status `'EXECUTED'`, pero nunca actualizaba la proyección en `Read_Virtual_Transfers`.
  3. En `TabReports.tsx`, el filtro `executedTransfers` solo buscaba `Status === 'COMPLETED'`.
* **Solución**:
  - Corregir `TabFloorReconciliation.tsx` para actualizar siempre `Read_Virtual_Transfers` a `COMPLETED`.
  - Actualizar `supabase/functions/confirm-transfer/index.ts` para proyectar la actualización a `Read_Virtual_Transfers` y registrar el evento con UUID.
  - Hacer el filtro de `TabReports.tsx` tolerante a `COMPLETED` y `EXECUTED`.

### Problema 4: "IMPACTO EN COSTO" intermitente o bugeado
* **Causa**:
  1. Cada 15 segundos, `App.tsx` consulta `Read_Missions` y llama a `setActiveMission` inyectando `data.TotalCostDiscrepancy ?? 0`.
  2. Si en la base de datos Supabase la columna `TotalCostDiscrepancy` de `Read_Missions` tiene `0` o `null` (porque no hay un trigger en la BD recalculándola continuamente), el sondeo periódico sobreescribía el cálculo reactivo que `useMissionStore` había calculado a partir de las tareas.
  3. `TabReports.tsx` leía únicamente `metrics.totalCostDiscrepancy`.
* **Solución**:
  - En `TabReports.tsx`, calcular el valor en vivo a partir de las tareas:
    `tasks.reduce((sum, t) => sum + (Number(t.Discrepancy ?? 0) * Number(t.Cost ?? 0)), 0)`.
  - En `useMissionStore.ts`, en `setActiveMission`, no sobreescribir `metrics.totalCostDiscrepancy` con 0 si ya existen tareas cargadas en el cliente con discrepancias calculadas.

---

## 2. Arquitectura del Flujo Corregido

```
┌────────────────────────────────────────────────────────────────────────┐
│                          APLICACIÓN AUDITORÍA                          │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
           ┌─────────────────────────┴────────────────────────┐
           ▼                                                  ▼
 ┌──────────────────────┐                           ┌────────────────────┐
 │  TabCollector        │                           │ TabFloorReconcil.  │
 │  (Conteo / Recalculo)│                           │ (Confirmar Trasl.) │
 └─────────┬────────────┘                           └─────────┬──────────┘
           │                                                  │
           ├─► Actualiza Read_Mission_Tasks                   ├─► Actualiza Read_Floor_Discrepancies
           │   (Status, Discrepancy, CountedQty)              │   (Status: 'RESOLVED', sin ResolvedAt)
           │                                                  │
           ├─► Si disc == 0: Cancela Discrepancia             ├─► Actualiza Read_Virtual_Transfers
           │   (Status: 'CANCELADA', sin ResolvedAt)          │   (Status: 'COMPLETED', UpdatedAt)
           │                                                  │
           ▼                                                  ▼
 ┌──────────────────────────────────┐               ┌──────────────────────────────────┐
 │ Edge Function: register-count    │               │ Edge Function: confirm-transfer  │
 │ - EventId: crypto.randomUUID()   │               │ - EventId: crypto.randomUUID()   │
 │ - Evento único en EventStore     │               │ - Proyecta en Read_Virtual_Trans.│
 │ - Sin colisión 23505             │               │ - Evento VirtualTransferExecuted │
 └──────────────────────────────────┘               └──────────────────────────────────┘
                                     │
                                     ▼
                      ┌──────────────────────────────┐
                      │ TabReports                   │
                      │ - Traslados: COMPLETED       │
                      │ - Costo: suma reactiva tasks │
                      │   (inmune al sondeo de 15s)  │
                      └──────────────────────────────┘
```

---

## 3. Modificaciones Detalladas por Archivo

### Archivo 1: `src/components/TabCollector.tsx`
- **Eliminar `ResolvedAt`**: Cambiar la actualización de `Read_Floor_Discrepancies` para enviar exclusivamente `{ Status: 'CANCELADA', UpdatedAt: nowIso }`.
- **Eliminar doble inserción directa en EventStore**: Retirar las llamadas locales directas `supabase.from('EventStore').insert(...)` previas a `register-count` para evitar colisión de claves y duplicación de eventos. La Edge Function `register-count` se encarga del registro oficial del evento.

### Archivo 2: `src/components/TabFloorReconciliation.tsx`
- **Eliminar `ResolvedAt`**: En el flujo de cancelación / eliminación manual de discrepancias, enviar `{ Status: 'CANCELADA', UpdatedAt: nowIso }`.
- **Corregir confirmación de traslados**:
  - Asegurar que `Read_Virtual_Transfers` se actualice SIEMPRE a `Status: 'COMPLETED'` de forma directa e independiente de si hay error en el EventStore.
  - Invocar la Edge Function `confirm-transfer` para mantener la sincronización con el backend.

### Archivo 3: `src/components/TabReports.tsx`
- **Cálculo Blindado de Impacto en Costo**:
  ```ts
  const computedCostImpact = useMemo(() => {
    if (!tasks || tasks.length === 0) return Math.abs(metrics.totalCostDiscrepancy || 0);
    const sum = tasks.reduce((acc, t) => {
      const disc = Number(t.Discrepancy ?? 0);
      const cost = Number(t.Cost ?? 0);
      return acc + (disc * cost);
    }, 0);
    return Math.abs(sum);
  }, [tasks, metrics.totalCostDiscrepancy]);
  ```
- **Filtro de Traslados Confirmados**:
  ```ts
  const executedTransfers = useMemo(() => {
    return virtualTransfers.filter((vt) => {
      const st = String(vt.Status || (vt as any).status || '').toUpperCase();
      return st === 'COMPLETED' || st === 'EXECUTED';
    });
  }, [virtualTransfers]);
  ```

### Archivo 4: `src/store/useMissionStore.ts`
- En `setActiveMission`, si `mission.totalCostDiscrepancy` es `0` o `null`, pero el store ya tiene tareas cargadas con discrepancias, preservar el cálculo reactivo para no provocar saltos visuales durante el sondeo.

### Archivo 5: `supabase/functions/register-count/index.ts`
- Generar `EventId: crypto.randomUUID()` explícito tanto en `payloadToInsert` como en el evento secundario de discrepancia.
- Asignar `Timestamp: new Date().toISOString()`, `SequenceNum: Date.now()`, y `Version: 1`.

### Archivo 6: `supabase/functions/confirm-transfer/index.ts`
- Asignar `EventId: crypto.randomUUID()` explícito en el evento `VirtualTransferExecuted`.
- Actualizar de forma explícita `Read_Virtual_Transfers` con `{ Status: 'COMPLETED', UpdatedAt: new Date().toISOString() }` para que la lectura persista en la base de datos de Supabase.

---

## 4. Código y Scripts de Edge Functions para Supabase

### Definición Actualizada: `supabase/functions/register-count/index.ts`
```ts
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '*';
  const requestedHeaders = req.headers.get('Access-Control-Request-Headers') || '*';

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': requestedHeaders,
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    const { 
      mission_id, task_id, deposit_code, sku_code, 
      counted_quantity, system_quantity, sales_during_audit, user_id,
      target_deposit, target_system_quantity 
    } = body;

    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseClient = createClient(url, key);

    const safeCounted = Number(counted_quantity) || 0;
    const safeSystem = Number(system_quantity) || 0;
    const safeSales = Number(sales_during_audit) || 0;
    const safeTargetSystem = Number(target_system_quantity) || 0;
    const calculated_discrepancy = safeCounted - (safeSystem - safeSales);
    const final_target_deposit = target_deposit || (deposit_code === '150101' ? '150103' : '150101');
    const nowIso = new Date().toISOString();

    const payloadToInsert = {
      EventId: crypto.randomUUID(),
      AggregateId: task_id,
      AggregateType: 'MissionTask',
      EventType: 'TaskCountRegistered',
      UserId: user_id || '00000000-0000-0000-0000-000000000000',
      CorrelationId: crypto.randomUUID(),
      Payload: {
        mission_id, task_id, deposit_code, sku_code,
        counted_quantity: safeCounted, 
        system_quantity: safeSystem, 
        sales_during_audit: safeSales, 
        calculated_discrepancy
      },
      Metadata: { client: "PWA_AuditoriaPlus_Interceptor_Live" },
      SequenceNum: Date.now(),
      Timestamp: nowIso,
      Version: 1
    };

    const { error } = await supabaseClient.from('EventStore').insert(payloadToInsert);
    if (error) throw new Error("Error Evento Principal: " + error.message);

    if (calculated_discrepancy !== 0) {
      const { error: discError } = await supabaseClient
        .from('EventStore')
        .insert({
          EventId: crypto.randomUUID(),
          AggregateId: task_id,
          AggregateType: 'CrossDiscrepancy',
          EventType: 'DiscrepancyDetected',
          UserId: user_id || '00000000-0000-0000-0000-000000000000',
          CorrelationId: crypto.randomUUID(),
          Payload: {
            discrepancy_id: crypto.randomUUID(),
            mission_id,
            origin_deposit: deposit_code,
            target_deposit: final_target_deposit,
            sku_code,
            sku_description: "SKU " + sku_code,
            origin_discrepancy: calculated_discrepancy,
            target_system_quantity: safeTargetSystem,
            status: "PENDING_TARGET_COUNT"
          },
          Metadata: { trigger: "auto_discrepancy" },
          SequenceNum: Date.now(),
          Timestamp: nowIso,
          Version: 1
        });
        
      if (discError) throw new Error("Error Evento Discrepancia: " + discError.message);
    }

    return new Response(
      JSON.stringify({ 
        status: "success", 
        code: 200, 
        data: { 
          task_id, 
          calculated_discrepancy, 
          status: calculated_discrepancy === 0 ? 'COMPLETED_MATCH' : 'DISCREPANT' 
        } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Definición Actualizada: `supabase/functions/confirm-transfer/index.ts`
```ts
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') || '*';
  const requestedHeaders = req.headers.get('Access-Control-Request-Headers') || '*';

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': requestedHeaders,
    'Access-Control-Max-Age': '86400',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    const { transfer_id, mission_id, sku_code, user_id } = body;

    if (!transfer_id || !mission_id || !sku_code) {
      return new Response(JSON.stringify({ error: 'Parámetros requeridos faltantes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user_id || '00000000-0000-0000-0000-000000000000';
    const correlationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 1. Registrar Evento Inmutable en EventStore con EventId único
    const { error: eventError } = await supabase.from('EventStore').insert({
      EventId: crypto.randomUUID(),
      AggregateId: mission_id,
      AggregateType: 'Mission',
      EventType: 'VirtualTransferExecuted',
      Payload: {
        transfer_id,
        mission_id,
        sku_code,
        status: 'COMPLETED',
        manual_confirmation: true
      },
      Metadata: { source: 'edge_function_confirm_transfer' },
      UserId: userId,
      CorrelationId: correlationId,
      SequenceNum: Date.now(),
      Timestamp: nowIso,
      Version: 1
    });

    if (eventError) throw new Error("Fallo al registrar evento: " + eventError.message);

    // 2. Proyección directa en Read_Virtual_Transfers
    const { error: updateError } = await supabase
      .from('Read_Virtual_Transfers')
      .update({
        Status: 'COMPLETED',
        UpdatedAt: nowIso
      })
      .eq('TransferId', transfer_id);

    if (updateError) {
      console.warn('Advertencia actualizando Read_Virtual_Transfers:', updateError);
    }

    return new Response(JSON.stringify({
      success: true,
      transfer_id,
      status: 'COMPLETED'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
```

---

## 5. Plan de Verificación

1. **Prueba de Cancelación de Discrepancias**:
   - Abrir pestaña Discrepancias o realizar un re-conteo que nivele a 0.
   - Verificar que no ocurra el error `PGRST204` y que el registro pase a `Status: 'CANCELADA'` con `UpdatedAt` actualizado.
2. **Prueba de Conteo y EventStore**:
   - Ingresar un conteo físico desde `TabCollector`.
   - Confirmar que `Read_Mission_Tasks` se actualice de inmediato y que no salte el error `23505 duplicate key value violates unique constraint "EventStore_pkey"`.
3. **Prueba de Traslados Virtuales en Reportes**:
   - Confirmar un traslado sugerido en la pestaña Discrepancias.
   - Navegar a la pestaña Reportes y verificar que aparezca en la lista "Traslados Virtuales Registrados" con estatus `COMPLETED`.
4. **Prueba de Impacto Financiero en Costo**:
   - Observar el KPI de Impacto en Costo durante más de 30 segundos (superando los ciclos de sondeo de 15s de `App.tsx`).
   - Verificar que el valor se mantenga estable, correcto y fiel a las discrepancias y costos de los productos.
5. **Verificación de Compilación**:
   - Ejecutar `compile_applet` para garantizar que la compilación de TypeScript y Vite sea exitosa sin errores de tipado.
