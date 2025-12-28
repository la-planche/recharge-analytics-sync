import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchRechargeCharges() {
  try {
    const response = await fetch('https://api.rechargeapps.com/charges?sort_by=updated_at-desc&limit=90', {
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
  
  if (charge.line_items && Array.isArray(charge.line_items)) {
    for (const lineItem of charge.line_items) {
      if (lineItem.subscription_id) {
        events.push({
          charge_id: String(charge.id),
          subscription_id: String(lineItem.subscription_id),
          customer_id: String(charge.customer_id),
          original_scheduled_at: charge.scheduled_at,
          current_scheduled_at: charge.scheduled_at,
          status: charge.status,
          event_type: 'charge_update',
          created_at: charge.created_at,
          updated_at: charge.updated_at
        });
      }
    }
  }
  
  return events;
}

async function syncToSupabase() {
  console.log('Starting sync...');
  
  const charges = await fetchRechargeCharges();
  console.log(`Fetched ${charges.length} charges from Recharge`);
  
  const events = [];
  for (const charge of charges) {
    if (charge.created_at !== charge.updated_at) {
      const chargeEvents = transformChargeToEvents(charge);
      events.push(...chargeEvents);
    }
  }
  
  console.log(`Transformed ${events.length} events (excluding created charges)`);
  
  if (events.length > 0) {
    const { data, error } = await supabase
      .from('recharge_events')
      .upsert(events, {
        onConflict: 'charge_id,subscription_id'
      });
    
    if (error) {
      console.error('Supabase Error:', error);
      throw error;
    }
    
    console.log(`Successfully synced ${events.length} events to Supabase`);
  } else {
    console.log('No events to sync');
  }
}

syncToSupabase();
