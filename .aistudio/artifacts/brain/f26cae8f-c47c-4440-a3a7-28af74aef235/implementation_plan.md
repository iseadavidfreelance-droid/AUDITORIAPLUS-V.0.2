# Control Anti-Doble Conteo, Corrección de Descripción en Piso y Eliminación de Ventas

Plan de arquitectura y desarrollo para implementar la detección y bloqueo visual de productos ya contados en origen mostrando auditor y fecha, corregir la sustitución errónea del nombre del producto por el código SKU en la vista de piso, eliminar por completo la sección de ventas durante la auditoría, y garantizar la compatibilidad estricta con el esquema de base de datos de Supabase en `/docs/estructura_supabase_actualizada.ts`.

## Decisiones Críticas y Confirmaciones del Usuario

> [!IMPORTANT]
> Decisiones confirmadas a través del proceso interactivo:
> - **Tarjeta de advertencia fija para productos ya contados**: Al escanear o seleccionar un SKU que ya cuenta con un registro físico previo (`CountedQuantity !== null`), se presenta una **tarjeta fija en pantalla** (no un modal flotante) que informa que el producto ya fue auditado, indicando el **Nombre del Auditor**, la **Fecha y Hora del conteo**, la **Cantidad Contada ($Q_c$)**, la **Cantidad de Sistema ($S$)** y la **Diferencia**.
> - **Bloqueo general con re-conteo explícito**: Por defecto, el botón de registrar conteo se deshabilita para evitar sobreescrituras accidentales. Sin embargo, se provee un botón de acción secundaria: *"Desbloquear y volver a contar este SKU"*, que solicita una confirmación expresa al operador antes de habilitar un nuevo registro.
> - **Nombre real del producto en Piso / Destino**: Se resuelve el problema donde `SkuDescription` en `Read_Floor_Discrepancies` mostraba redundantemente el código del SKU. La vista cruzará los registros con `Read_Mission_Tasks` para desplegar el **nombre auténtico del artículo**, separando visualmente el código SKU de su descripción comercial.
> - **Eliminación total del módulo de Ventas durante la auditoría**: Se erradica el input de ventas y sus columnas asociadas (`Ventas Hoy (V)` y `Teórico (S - V)`). La ecuación queda simplificada a $S$ vs $Q_c$ con diferencia directa ($Q_c - S$), enviando `SalesDuringAudit: 0` a Supabase para preservar la integridad del esquema sin requerir cambios de DDL.
> - **Alineación con la base de datos oficial (`/docs`)**: Validación exhaustiva contra las tablas `Read_Mission_Tasks`, `Read_Floor_Discrepancies`, `Read_Virtual_Transfers` y `EventStore`.

---

### 1. Resumen y Concepto General

- **Qué resuelve**: 
  1. **Integridad de Conteo**: Evita el error crítico donde un operador o un segundo auditor vuelve a contar un producto ya registrado, perdiendo la trazabilidad de quién lo contó y cuándo.
  2. **Claridad Visual en Piso**: Elimina la confusión donde los auditores de piso veían listas de números idénticos (SKU como descripción), devolviendo la visibilidad del nombre real del producto.
  3. **Simplificación Operativa**: Suprime un campo de ventas innecesario que ralentizaba la captura física en galpón.

---

### 2. Experiencia de Usuario y Diseño Visual

#### Flujo 1: Detección de SKU Ya Contado en Origen (`TabCollector.tsx`)

1. El auditor escanea o introduce un código de producto.
2. Si la tarea está en estado pendiente (`CountedQuantity === null`):
   - Flujo normal de captura: muestra stock de sistema, input de cantidad física y botón de registro.
3. Si la tarea **ya fue contada previamente**:
   - Se despliega una **Tarjeta Fija de Advertencia** con estilo corporativo (borde `#263988` y fondo `#F8F9FA`):
     - Encabezado: `PRODUCTO YA AUDITADO EN ESTA MISIÓN` con icono de verificación y estado actual (`Coincidencia Exacta` o `Discrepancia`).
     - Metadatos de auditoría:
       - **Auditor**: Nombre del operador que ejecutó el conteo (ej. `David Isea` o `Auditor 150101`).
       - **Fecha y Hora**: Estampa cronológica formateada (ej. `12/10/2026, 04:15 AM`).
     - Resumen numérico:
       - Contado: **$Q_c$ unidades**
       - Sistema: **$S$ unidades**
       - Discrepancia: **$\pm \Delta$ unidades**
     - El botón estándar de registro queda bloqueado para prevenir duplicaciones.
     - Botón de contingencia: `VOLVER A CONTAR ESTE SKU`. Al pulsarlo, emerge un diálogo nativo de confirmación: *"¿Deseas modificar el conteo previo realizado por [Auditor]? Esta acción registrará un nuevo ajuste."* Si se acepta, se habilita el campo de edición física.

#### Flujo 2: Identificación Clara del Producto en Destino (`TabFloorReconciliation.tsx`)

1. Al acceder a la pestaña de **Piso (150103)**:
2. La lista de "Pendientes por Verificar" vincula reactivamente cada discrepancia con el catálogo de tareas (`Read_Mission_Tasks`):
   - Muestra el **Código SKU** en un badge monospaciado: `SKU: 001245`.
   - Muestra el **Nombre Real del Producto** en tipografía destacada: `Aceite Vegetal Diana 1L`.
   - Se elimina por completo la sobreescritura donde el SKU reemplazaba al nombre.
3. Al registrar la reconciliación o traslado, el sistema envía el `SkuDescription` auténtico hacia Supabase para sanear la tabla `Read_Floor_Discrepancies`.

#### Flujo 3: Eliminación del Bloque de Ventas (`TabCollector.tsx`)

1. Se retira el campo inferior *"VENTAS REGISTRADAS DURANTE LA AUDITORÍA"*.
2. El grid de inventario se simplifica a 2 paneles limpios y de alto contraste:
   - **Sistema ($S$)**: Stock teórico vigente (ERP o almacenado).
   - **Contado Físico ($Q_c$)**: Entrada numérica industrial grande.
3. La diferencia se calcula de inmediato como $Q_c - S$, con feedback háptico y banners reactivos en verde esmeralda (`#009045`) o ámbar (`#F59E0B`).

---

### 3. Decisiones de Producto y Arquitectura

#### Decisión 1: Tarjeta Fija vs Modal Emergente para SKUs Ya Contados
- **Enfoque adoptado**: Tarjeta integrada fija en el flujo del colector.
- **Justificación**: En terminales industriales o smartphones de almacén, los modales emergentes bloquean la navegación con cierres accidentales. Una tarjeta fija mantiene visible toda la información del SKU y del auditor sin interrumpir el flujo táctil.

#### Decisión 2: Trazabilidad del Auditor en `EventStore` y Memoria
- **Enfoque adoptado**: Al registrar un conteo, guardar el usuario responsable tanto en el payload local de la tarea como en `EventStore` (`EventType: 'TaskCountRegistered'`) con metadata `{ auditor_name: user.email || user.username }`.
- **Justificación**: Permite responder con exactitud quién y cuándo contó el producto al volver a escanearlo, sin alterar las columnas de `Read_Mission_Tasks`.

#### Decisión 3: Resolución de Nombres de Producto en Tiempo de Ejecución
- **Enfoque adoptado**: Función de normalización `getRealSkuDescription(skuCode)` que busca primero en `tasks` (`Read_Mission_Tasks`), donde el nombre del producto es auténtico, sustituyendo cualquier valor numérico o redundante proveniente de `Read_Floor_Discrepancies`.
- **Justificación**: Corrige el bug visual de inmediato en la interfaz sin necesidad de migraciones destructivas en la base de datos de producción.

---

### 4. Arquitectura Técnica y Estrategia de Datos

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             FLUJO DE VERIFICACIÓN Y AUDITORÍA                    │
└──────────────────────────────────────────────────────────────────────────────────┘

   [ Escaneo de SKU en Origen ]
                │
                ▼
       ¿task.CountedQuantity !== null?
          │                     │
         SÍ                     NO
          │                     │
          ▼                     ▼
   [ Tarjeta de Advertencia Fija ]   [ Formulario Directo de Conteo ]
   - "Ya contado por [Auditor]"       - Sistema (S) vs Físico (Qc)
   - Fecha/Hora: [task.UpdatedAt]     - Botón "REGISTRAR CONTEO"
   - Qc, S, Discrepancia
   - Botón: [Volver a contar]
          │ (Con confirmación)
          ▼
   [ Desbloqueo Asistido ]


   [ Lista de Piso en Destino ]
                │
                ▼
   Read_Floor_Discrepancies (Dato crudo)
                │
                ▼ (Cruce con Read_Mission_Tasks)
   matchingTask?.SkuDescription !== SkuCode ? matchingTask.SkuDescription : d.SkuDescription
                │
                ▼
   [ Renderizado Claro ]: Badge SKU (001245) + Nombre Real ("Arroz Primor 1kg")
```

#### Validación de Coherencia con `/docs/estructura_supabase_actualizada.ts`

1. **`Read_Mission_Tasks`**:
   - `SystemQuantity`: Cantidad de sistema en vivo.
   - `CountedQuantity`: Cantidad física contada.
   - `SalesDuringAudit`: Fijado a `0` (compatible con el tipo `number` obligatorio).
   - `Discrepancy`: $Q_c - S$.
   - `Status`: `COMPLETED_MATCH` o `DISCREPANT`.
   - `UpdatedAt`: Timestamp ISO para fecha de auditoría.
2. **`Read_Floor_Discrepancies`**:
   - `SkuCode`: Código numérico o alfanumérico del producto.
   - `SkuDescription`: Nombre real del artículo verificado.
   - `OriginDeposit`, `TargetDeposit`, `OriginDiscrepancy`, `TargetSystemQuantity`, `TargetCountedQuantity`, `TargetDiscrepancy`, `Status`.
3. **`EventStore`**:
   - Registro de auditoría `TaskCountRegistered` con `UserId`, `Timestamp` y `Payload` conteniendo el nombre del auditor para consulta histórica.
