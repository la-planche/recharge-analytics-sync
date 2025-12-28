import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchRechargeCharges() {
  try {
    const response = await fetch('https://api.rechargeapps.com/charges?sort_by=updated_at-desc&limit=50', {
      headers: {
        'X-Recharge-Access-Token': RECHARGE_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Recharge API Error:', response.status, errorText);
      return [];
    }
    
    const data = await response.json();
    return data.charges || [];
  } catch (error) {
    console.error('Error fetching charges:', error);
    return [];
  }
}

function transformChargeToEvents(charge) {
  const events = [];
  
  // Filtrer : seulement les charges modifiées (pas les créations)
  if (charge.created_at === charge.updated_at) {
    return events;
  }
  
  charge.line_items?.forEach(item => {
    if (item.subscription_id) {
      events.push({
        charge_id: charge.id?.toString(),
        subscription_id: item.subscription_id?.toString(),
        customer_id: charge.customer_id?.toString(),
        original_scheduled_at: charge.scheduled_at,
        current_scheduled_at: charge.scheduled_at,
        status: charge.status || 'UNKNOWN',
        event_type: charge.status === 'SKIPPED' ? 'skip' : 'charge',
        created_at: charge.created_at,
        updated_at: charge.updated_at
      });
    }
  });
  
  return events;
}

async function insertEventsToSupabase(events) {
  try {
    const { error } = await supabase
      .from('recharge_events')
      .upsert(events, { onConflict: 'charge_id,subscription_id' });
    
    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    console.log(`✅ Successfully synced ${events.length} events`);
  } catch (error) {
    console.error('Error inserting to Supabase:', error);
    throw error;
  }
}

async function syncRechargeData() {
  try {
    console.log('Starting sync...');
    const charges = await fetchRechargeCharges();
    
    if (charges.length === 0) {
      console.log('⚠️ No charges found or API error');
      return;
    }
    
    console.log(`📦 Found ${charges.length} charges`);
    const events = charges.flatMap(transformChargeToEvents);
    
    if (events.length === 0) {
      console.log('⚠️ No modified charges found');
      return;
    }
    
    await insertEventsToSupabase(events);
    console.log('🎉 Sync completed successfully!');
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

syncRechargeData();
