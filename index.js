import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const RECHARGE_API_KEY = process.env.RECHARGE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchRechargeCharges() {
  const response = await fetch('https://api.rechargeapps.com/charges', {
    headers: {
      'X-Recharge-Access-Token': RECHARGE_API_KEY,
      'Accept': 'application/json'
    }
  });
  const data = await response.json();
  return data.charges || [];
}

function transformChargeToEvent(charge) {
  return {
    charge_id: charge.id?.toString(),
    subscription_id: charge.subscription_id?.toString(),
    customer_id: charge.customer_id?.toString(),
    original_scheduled_at: charge.scheduled_at,
    current_scheduled_at: charge.scheduled_at,
    status: charge.status || 'UNKNOWN',
    event_type: charge.status === 'SKIPPED' ? 'skip' : 'charge'
  };
}

async function insertEventsToSupabase(events) {
  const { error } = await supabase
    .from('recharge_events')
    .upsert(events, { onConflict: 'charge_id' });
  if (error) throw error;
}

async function syncRechargeData() {
  console.log('Starting sync...');
  const charges = await fetchRechargeCharges();
  const events = charges.map(transformChargeToEvent);
  if (events.length > 0) {
    await insertEventsToSupabase(events);
    console.log(`Synced ${events.length} events`);
  }
}

syncRechargeData();
