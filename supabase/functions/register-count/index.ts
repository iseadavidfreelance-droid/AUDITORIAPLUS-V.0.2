import { createClient } from "npm:@supabase/supabase-js@2.39.3";

console.log("🟢 [1] ISOLATE INICIADO EN DENO 2.1.4 (VERSION BIDIRECCIONAL + LIVE API)");

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
    
    // EXTRAEMOS LOS NUEVOS DATOS ENVIADOS POR EL INTERCEPTOR
    const { 
      mission_id, task_id, deposit_code, sku_code, sku_description,
      counted_quantity, system_quantity, sales_during_audit, user_id,
      target_deposit, target_system_quantity 
    } = body;

    const url = Deno.env.get('SUPABASE_URL') || '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabaseClient = createClient(url, key);

    // BLINDAJE MATEMÁTICO
    const safeCounted = Number(counted_quantity) || 0;
    const safeSystem = Number(system_quantity) || 0;
    const safeSales = Number(sales_during_audit) || 0;
    const safeTargetSystem = Number(target_system_quantity) || 0;
    
    const calculated_discrepancy = safeCounted - (safeSystem - safeSales);

    // Deducir destino por seguridad si no viene en el payload
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
      Timestamp: nowIso,
      Version: 1
    };

    const { error } = await supabaseClient.from('EventStore').insert(payloadToInsert);
    if (error) throw new Error("Error Evento Principal: " + error.message);

    const taskStatus = calculated_discrepancy === 0 ? 'COMPLETED_MATCH' : 'DISCREPANT';

    // 2. Proyección autorizada en Read_Mission_Tasks usando Service Role
    const { error: taskProjError } = await supabaseClient
      .from('Read_Mission_Tasks')
      .update({
        CountedQuantity: safeCounted,
        SalesDuringAudit: safeSales,
        Discrepancy: calculated_discrepancy,
        Status: taskStatus,
        UpdatedAt: nowIso
      })
      .eq('TaskId', task_id);

    if (taskProjError) {
      console.warn("Advertencia al actualizar proyección Read_Mission_Tasks:", taskProjError);
    }

    let returnedDiscId: string | null = null;

    if (calculated_discrepancy !== 0) {
      const discId = body.discrepancy_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.discrepancy_id)
        ? body.discrepancy_id
        : crypto.randomUUID();
      returnedDiscId = discId;

      const realSkuDesc = sku_description || ("SKU " + sku_code);

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
            discrepancy_id: discId,
            mission_id: mission_id,
            origin_deposit: deposit_code,
            target_deposit: final_target_deposit,
            sku_code: sku_code,
            sku_description: realSkuDesc,
            origin_discrepancy: calculated_discrepancy,
            target_system_quantity: safeTargetSystem,
            status: "PENDING_TARGET_COUNT"
          },
          Metadata: { trigger: "auto_discrepancy" },
          Timestamp: nowIso,
          Version: 1
        });
        
      if (discError) throw new Error("Error Evento Discrepancia: " + discError.message);

      // 3. Proyección autorizada en Read_Floor_Discrepancies usando Service Role
      const { error: floorDiscErr } = await supabaseClient
        .from('Read_Floor_Discrepancies')
        .upsert({
          DiscrepancyId: discId,
          MissionId: mission_id,
          OriginDeposit: deposit_code,
          OriginDiscrepancy: calculated_discrepancy,
          SkuCode: sku_code,
          SkuDescription: realSkuDesc,
          Status: "PENDING_TARGET_COUNT",
          TargetDeposit: final_target_deposit,
          TargetSystemQuantity: safeTargetSystem,
          UpdatedAt: nowIso
        });

      if (floorDiscErr) {
        console.warn("Advertencia al proyectar Read_Floor_Discrepancies:", floorDiscErr);
      }
    } else {
      // Re-conteo exacto (discrepancia 0): cancelar discrepancias abiertas previas si existen
      try {
        const { data: openDiscs } = await supabaseClient
          .from('Read_Floor_Discrepancies')
          .select('DiscrepancyId')
          .eq('MissionId', mission_id)
          .eq('SkuCode', sku_code)
          .or('Status.eq.OPEN,Status.eq.PENDING_TARGET_COUNT,Status.eq.PENDING_FLOOR_COUNT')
          .limit(1);

        if (openDiscs && openDiscs.length > 0) {
          const discId = openDiscs[0].DiscrepancyId;
          await supabaseClient.from('EventStore').insert({
            EventId: crypto.randomUUID(),
            AggregateId: task_id,
            AggregateType: 'FloorDiscrepancy',
            EventType: 'DiscrepancyCancelled',
            UserId: user_id || '00000000-0000-0000-0000-000000000000',
            CorrelationId: crypto.randomUUID(),
            Payload: {
              discrepancy_id: discId,
              sku_code: sku_code,
              mission_id: mission_id,
              reason: 'RECOUNT_MATCH_ZERO_DISCREPANCY'
            },
            Metadata: { trigger: "recount_exact_match" },
            Timestamp: nowIso,
            Version: 1
          });

          await supabaseClient
            .from('Read_Floor_Discrepancies')
            .update({ Status: 'CANCELADA', UpdatedAt: nowIso })
            .eq('DiscrepancyId', discId);
        }
      } catch (cancelErr) {
        console.warn('Advertencia al cancelar discrepancia previa por reconteo cuadrado:', cancelErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        code: 200,
        data: {
          task_id,
          calculated_discrepancy,
          status: taskStatus,
          discrepancy_id: returnedDiscId
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});