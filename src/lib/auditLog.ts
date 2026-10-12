/**
 * AUDITORIAPLUS+ - Servicio de Trazabilidad y Registro de Auditoría
 * Gestiona el almacenamiento y consulta del auditor y timestamp para cada SKU auditado.
 * Alineado 100% con EventStore y Read_Users_Gamification en Supabase (/docs/estructura_supabase_actualizada.ts).
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { User } from '@supabase/supabase-js';

export interface TaskAuditRecord {
  auditorName: string;
  countedAt: string;
}

const LOCAL_STORAGE_KEY = 'auditoria_task_auditors_v1';
const localAuditCache: Record<string, TaskAuditRecord> = {};

// Inicialización de caché local persistente
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      Object.assign(localAuditCache, JSON.parse(raw));
    }
  }
} catch {
  // Ignorar errores de acceso al almacenamiento
}

/**
 * Obtiene el nombre legible del auditor actual desde la sesión de Supabase
 */
export function getAuditorName(user: User | null): string {
  if (!user) return 'Auditor';
  if (user.user_metadata?.full_name) return String(user.user_metadata.full_name);
  if (user.user_metadata?.username) return String(user.user_metadata.username);
  if (user.user_metadata?.name) return String(user.user_metadata.name);
  if (user.email) {
    const email = user.email.toLowerCase();
    if (email.includes('franyelin')) return 'Franyelin';
    if (email.includes('david')) return 'David';
    if (email.includes('luis')) return 'Luis';
    const namePart = email.split('@')[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  }
  return 'Auditor';
}

/**
 * Guarda en memoria y localStorage la información del auditor y fecha para un SKU
 */
export function saveTaskAuditRecord(
  taskId: string,
  skuCode: string,
  auditorName: string,
  countedAt: string
): void {
  const record: TaskAuditRecord = { auditorName, countedAt };
  if (taskId) localAuditCache[taskId] = record;
  if (skuCode) localAuditCache[skuCode.trim()] = record;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localAuditCache));
    }
  } catch {
    // Ignorar cuota o bloqueo de localStorage
  }
}

/**
 * Recupera la información de auditoría para una tarea.
 * 1. Consulta la caché local instantánea.
 * 2. Si no está en caché y hay conexión, consulta EventStore en Supabase.
 * 3. Si no existe evento, utiliza el timestamp provisto o el fallback predeterminado.
 */
export async function getTaskAuditRecord(
  taskId: string,
  skuCode?: string,
  fallbackTimestamp?: string
): Promise<TaskAuditRecord> {
  const trimmedSku = (skuCode || '').trim();

  // 1. Hit en caché local inmediata (0ms)
  if (taskId && localAuditCache[taskId]) {
    return localAuditCache[taskId];
  }
  if (trimmedSku && localAuditCache[trimmedSku]) {
    return localAuditCache[trimmedSku];
  }

  // 2. Consulta en vivo a EventStore
  if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('EventStore')
        .select('UserId, Timestamp, Metadata')
        .eq('AggregateId', taskId)
        .order('Timestamp', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const event = data[0];
        let auditorName = '';

        if (event.Metadata && typeof event.Metadata === 'object' && 'auditor_name' in event.Metadata) {
          auditorName = String((event.Metadata as Record<string, unknown>).auditor_name);
        }

        if (!auditorName && event.UserId) {
          const { data: userGam } = await supabase
            .from('Read_Users_Gamification')
            .select('Username')
            .eq('UserId', event.UserId)
            .maybeSingle();

          if (userGam?.Username) {
            auditorName = userGam.Username;
          }
        }

        if (!auditorName) {
          auditorName = 'Auditor';
        }

        const countedAt = event.Timestamp || fallbackTimestamp || new Date().toISOString();
        saveTaskAuditRecord(taskId, trimmedSku, auditorName, countedAt);
        return { auditorName, countedAt };
      }
    } catch (err) {
      console.warn('[AuditLog] Error consultando EventStore:', err);
    }
  }

  // 3. Fallback seguro
  const fallbackRecord: TaskAuditRecord = {
    auditorName: 'Auditor Asignado',
    countedAt: fallbackTimestamp || new Date().toISOString(),
  };

  if (taskId) localAuditCache[taskId] = fallbackRecord;
  if (trimmedSku) localAuditCache[trimmedSku] = fallbackRecord;

  return fallbackRecord;
}

/**
 * Formatea una fecha ISO en formato legible local en español
 */
export function formatAuditDate(isoString?: string): string {
  if (!isoString) return 'Fecha no disponible';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Fecha no disponible';
    return d.toLocaleString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}
