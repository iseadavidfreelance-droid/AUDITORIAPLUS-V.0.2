import { createClient } from "npm:@supabase/supabase-js@2.39.3";

console.log("🟢 [1] INICIANDO: confirm-transfer (CQRS + Proyección Read_Virtual_Transfers)");

Deno.serve(async (req) => {
  // --- ESPEJO CORS ABSOLUTO ---
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

    const {
      transfer_id,
      mission_id,
      sku_code,
      user_id
    } = body;

    if (!transfer_id || !mission_id || !sku_code) {
      return new Response(JSON.stringify({ error: 'Parámetros requeridos faltantes' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user_id || '00000000-0000-0000-0000-000000000000';
    const correlationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // 1. CQRS PURO: Escribir Evento Inmutable en EventStore con EventId y Timestamp explícitos (sin forzar SequenceNum)
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
      Timestamp: nowIso,
      Version: 1
    });

    if (eventError) {
      console.warn("Advertencia al registrar evento de confirmación en EventStore:", eventError.message);
    }

    // 2. Proyección directa y persistente en Read_Virtual_Transfers
    const { error: updateError } = await supabase
      .from('Read_Virtual_Transfers')
      .update({
        Status: 'COMPLETED',
        UpdatedAt: nowIso
      })
      .eq('TransferId', transfer_id);

    if (updateError) {
      console.error('Error actualizando Read_Virtual_Transfers:', updateError);
      return new Response(JSON.stringify({ error: updateError.message, transfer_id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 3. Proyección en Read_Floor_Discrepancies: Marcar discrepancia como RESOLVED
    await supabase
      .from('Read_Floor_Discrepancies')
      .update({
        Status: 'RESOLVED',
        UpdatedAt: nowIso
      })
      .eq('MissionId', mission_id)
      .eq('SkuCode', sku_code)
      .or('Status.eq.OPEN,Status.eq.PENDING_TARGET_COUNT,Status.eq.PENDING_FLOOR_COUNT,Status.eq.PENDING_TRANSFER_APPROVAL');

    // Consultar el traslado para obtener TransferQuantity
    const { data: transferRecord } = await supabase
      .from('Read_Virtual_Transfers')
      .select('TransferQuantity, FromDeposit, ToDeposit')
      .eq('TransferId', transfer_id)
      .maybeSingle();

    const transferQty = Number(body.transfer_quantity ?? transferRecord?.TransferQuantity ?? 0);

    // Consultar la tarea correspondiente para calcular la nueva diferencia neta
    const { data: currentTask } = await supabase
      .from('Read_Mission_Tasks')
      .select('TaskId, Discrepancy, DepositCode')
      .eq('MissionId', mission_id)
      .eq('SkuCode', sku_code)
      .maybeSingle();

    let adjustedDiscrepancy = 0;
    if (currentTask) {
      const origDisc = Number(currentTask.Discrepancy ?? 0);
      if (origDisc < 0) {
        // Faltante en origen: el traslado hacia el depósito compensa positivamente (e.g. -2 + 2 = 0; -3 + 2 = -1)
        adjustedDiscrepancy = Math.min(0, Number((origDisc + transferQty).toFixed(2)));
      } else if (origDisc > 0) {
        // Sobrante en origen: el traslado saliente compensa negativamente (e.g. +2 - 2 = 0; +3 - 2 = +1)
        adjustedDiscrepancy = Math.max(0, Number((origDisc - transferQty).toFixed(2)));
      }
    }

    // 4. Proyección en Read_Mission_Tasks: Actualizar Discrepancy ajustada y fijar Status: 'RECONCILED'
    await supabase
      .from('Read_Mission_Tasks')
      .update({
        Status: 'RECONCILED',
        Discrepancy: adjustedDiscrepancy,
        UpdatedAt: nowIso
      })
      .eq('MissionId', mission_id)
      .eq('SkuCode', sku_code);

    return new Response(JSON.stringify({
      success: true,
      transfer_id,
      status: 'COMPLETED',
      adjusted_discrepancy: adjustedDiscrepancy
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error("🔥 [FATAL] CRASH:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});