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

    // 1. CQRS PURO: Escribir Evento Inmutable en EventStore con EventId y Timestamp explícitos
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
    console.error("🔥 [FATAL] CRASH:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});