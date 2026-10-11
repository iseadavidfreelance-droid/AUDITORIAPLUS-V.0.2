# Filtros Reactivos y Exportación Excel Estilizada en Detalle de Tareas

Plan de arquitectura y diseño para incorporar filtros bidireccionales por tipo de diferencia (Faltantes, Sobrantes, Cuadrados) y por estado de auditoría en la tabla de Detalle de Tareas de Inventario, sustituyendo la impresión tradicional por un motor de exportación en formato Excel (.xlsx) con la estética visual corporativa de la aplicación.

> [!IMPORTANT]
> **Decisiones Confirmadas con el Usuario:**
> - **Sustitución de Acción Principal**: El botón tradicional de *Imprimir Ficha Completa* será reemplazado por la acción *Exportar Excel*.
> - **Filtros por Tipo de Diferencia**: Cuatro estados discretos seleccionables: *Todos*, *Solo Faltantes* (diferencia < 0), *Solo Sobrantes* (diferencia > 0) y *Cuadrados* (diferencia = 0 con conteo registrado).
> - **Filtros por Estado de Auditoría**: Filtrado por ciclo de vida de la tarea (*Todos*, *Pendientes*, *Coincidencia Exacta*, *Discrepancia Detectada*, *Trasladado*, *Traslado Parcial*).
> - **Estructura del Excel Exportado**: Dos modalidades accesibles:
>   1. **Reporte Ejecutivo**: Hoja con bloque de KPIs consolidados en la cabecera + tabla formateada con la estética corporativa.
>   2. **Tabla de Datos Directa**: Hoja orientada a análisis operativo con cabecera corporativa y formato tabular limpio.
>   *Implementación recomendada*: El archivo `.xlsx` generado integrará ambas hojas (*Resumen Ejecutivo* y *Datos Detallados*) o permitirá descargarlas según la preferencia del operador mediante un selector rápido.

---

## 1. Overview & Core Concept

- **Qué hace**: Permite a auditores y gerentes de almacén segmentar al instante cientos de SKUs según su balance físico (detectar faltantes críticos para investigación o sobrantes para reubicación), visualizarlos en pantalla con contadores en tiempo real y exportar la selección directamente a un archivo Excel nativo de alta fidelidad estética.
- **Audiencia objetivo**: Auditores de piso, supervisores de inventario y contralores de inventario que necesitan reportes ejecutivos listos para presentar o matrices tabulares para conciliar en ERPs.
- **Valor clave**: Elimina la fricción del diálogo de impresión en papel/PDF plano, permite trabajar con los datos filtrados en hojas de cálculo y preserva la identidad visual corporativa (Azul Marino `#263988`, Verde Esmeralda `#009045`, Fondo `#F8F9FA`, tipografía tabular y badges de color).

---

## 2. User Experience & Visual Design

### Flujo de Interacción del Usuario
1. **Acceso**: El usuario ingresa a la pestaña *Reportes* y visualiza el bloque *Detalle de Tareas de Inventario*.
2. **Barra de Herramientas de Filtrado**:
   - Selector de Diferencia: Segmented control ergonómico con opciones: `Todos` | `Solo Faltantes` | `Solo Sobrantes` | `Cuadrados`.
   - Selector de Estado: Dropdown estilizado con estados del inventario (`Todos`, `Pendientes`, `Exactos`, `Discrepantes`, `Trasladados`).
   - Búsqueda Rápida: Input de búsqueda por código SKU o descripción con limpieza en un clic.
   - Indicador de Resultados: Contador reactivo discreto (ej. `Mostrando 18 de 64 SKUs`).
3. **Exportación a Excel**:
   - Al pulsar el botón `Exportar Excel` (diseñado con botón corporativo esmeralda/marino y menú desplegable o diálogo modal ligero):
   - El operador elige: *Libro Completo (KPIs + Detalle)* o *Solo Datos Detallados*.
   - El sistema genera asíncronamente el archivo `.xlsx` aplicando los filtros actualmente activos.
   - Notificación toast visual de éxito con confirmación del número de registros exportados.

### Identidad Visual y Estilo del Excel
- **Paleta de Colores en Excel**:
  - Encabezados Principales y Banners: Azul Marino Profundo (`#263988`) con tipografía blanca en negrita.
  - Indicadores y Totales: Verde Esmeralda (`#009045`) y acentos de advertencia en Ámbar (`#F59E0B`) y Rojo (`#DC2626`).
  - Filas Alternas: Fondo suave (`#F8F9FA`) y líneas de división sutiles (`#E5E7EB`).
  - Tipografía: Fuente corporativa limpia, columnas numéricas formateadas a dos decimales con alineación derecha (`tabular-nums`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Generación de Excel en el Cliente con `exceljs`**:
  - *Enfoque*: Emplear `exceljs` para construir el binario `.xlsx` en el navegador.
  - *Por qué*: Soporta de forma nativa estilos completos en celdas (colores de relleno sólidos ARGB, colores de fuente, bordes, alineación, anchos automáticos de columna y múltiples pestañas). Las alternativas como `xlsx` básico (SheetJS comunitario) carecen de soporte libre para estilos avanzados en celdas.
  - *Alternativa descartada*: Formato HTML/CSV plano; aunque rápido, no preserva la estética visual ni los múltiples estilos que requiere el cliente.

- **Decisión 2: Sincronización Estricta entre Vista y Exportación**:
  - *Enfoque*: El motor de exportación consume exactamente el conjunto de datos resultante de los filtros activos en la tabla (diferencia, estado y texto de búsqueda), asegurando que lo que el usuario ve en pantalla es exactamente lo que descarga.
  - *Por qué*: Evita inconsistencias operativas donde un gerente aplica un filtro en la vista pero el archivo descargado contiene datos no filtrados.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TabReports Component                            │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Filtros de Tareas (State)                     │  │
│  │  - differenceFilter: 'ALL' | 'MISSING' | 'SURPLUS' | 'EXACT'     │  │
│  │  - statusFilter: string ('ALL' | 'PENDING' | 'COMPLETED' ...)    │  │
│  │  - searchQuery: string                                           │  │
│  └─────────────────────────────────┬────────────────────────────────┘  │
│                                    ▼                                   │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │               filteredTasks = useMemo(..., [tasks, filters])     │  │
│  └──────────────┬───────────────────────────────────┬───────────────┘  │
│                 ▼                                   ▼                  │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │      Tabla Renderizada UI     │  │     exportTasksToExcel()      │  │
│  │   - Paginación/Scroll suave   │  │   - Genera Libro (.xlsx)      │  │
│  │   - Badges de estado          │  │   - Aplica paleta corporativa │  │
│  │   - Diferencias coloreadas    │  │   - Dispara descarga binaria  │  │
│  └───────────────────────────────┘  └───────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Entidades y Mapeo de Filtros
- **Diferencia**:
  - `MISSING`: `task.Discrepancy < 0` (Faltante físico frente a teórico).
  - `SURPLUS`: `task.Discrepancy > 0` (Sobrante físico frente a teórico).
  - `EXACT`: `task.Discrepancy === 0 && isCounted` (Conteo realizado y cuadrado).
  - `ALL`: Todos los registros.
- **Estado**:
  - Mapeo directo contra `task.Status` (`PENDING`, `COMPLETED_MATCH`, `DISCREPANCY_FOUND`, `RECONCILED`, `PARTIALLY_RECONCILED`).
