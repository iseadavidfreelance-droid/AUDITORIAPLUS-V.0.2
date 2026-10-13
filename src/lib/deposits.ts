/**
 * AUDITORIAPLUS+ - Mapeo y Normalización de Depósitos
 * Estandariza los códigos de almacén reduciendo la fricción para los operadores.
 * - 150101: ALMACÉN
 * - 150103: PISO DE VENTAS
 */

export const DEPOSIT_CODES = {
  WAREHOUSE: '150101',
  FLOOR: '150103',
} as const;

export const DEPOSIT_NAMES: Record<string, string> = {
  '150101': 'ALMACÉN',
  '150103': 'PISO DE VENTAS',
};

/**
 * Retorna el nombre formateado amigable junto al código entre paréntesis
 * Ejemplo: "ALMACÉN (150101)" o "PISO DE VENTAS (150103)"
 */
export const formatDepositLabel = (code: string | number | null | undefined): string => {
  if (!code) return 'DEP. NO ASIGNADO';
  const cleanCode = String(code).trim();
  const name = DEPOSIT_NAMES[cleanCode];
  if (name) {
    return `${name} (${cleanCode})`;
  }
  return `DEPÓSITO (${cleanCode})`;
};

/**
 * Retorna únicamente el nombre descriptivo del depósito
 */
export const getDepositName = (code: string | number | null | undefined): string => {
  if (!code) return 'Depósito';
  const cleanCode = String(code).trim();
  return DEPOSIT_NAMES[cleanCode] || `Dep. ${cleanCode}`;
};
