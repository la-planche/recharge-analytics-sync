import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const RECHARGE_WEBHOOK_SECRET = process.env.RECHARGE_WEBHOOK_SECRET; // À ajouter dans Vercel

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Handler pour le webhook Recharge subscription/updated
 * Capture les changements de produit/variant sur les subscriptions
 */
export default async function handler(req, res) {
  // Vérifier que c'est bien une requête POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Optionnel : Vérifier le webhook secret pour la sécurité
    const webhookSecret = req.headers['x-recharge-hmac-sha256'];
    if (RECHARGE_WEBHOOK_SECRET && webhookSecret !== RECHARGE_WEBHOOK_SECRET) {
      console.error('Invalid webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body;
    console.log('Received webhook:', payload.topic);

    // Ne traiter que les webhooks subscription/updated
    if (payload.topic !== 'subscription/updated') {
      return res.status(200).json({ message: 'Webhook ignored' });
    }

    const subscription = payload.subscription;
    
    // Vérifier s'il y a eu un changement de produit/variant
    // Recharge envoie l'ancien et le nouveau dans certains cas
    // Sinon on peut comparer avec la version précédente en base
    
    const events = [];
    
    // Créer un événement pour chaque changement détecté
    if (subscription.shopify_variant_id) {
      // Récupérer l'ancienne valeur depuis la base
      const { data: existingEvents } = await supabase
        .from('recharge_events')
        .select('current_variant_id, current_product_id')
        .eq('subscription_id', String(subscription.id))
        .order('updated_at', { ascending: false })
        .limit(1);

      const previousVariantId = existingEvents?.[0]?.current_variant_id || null;
      const previousProductId = existingEvents?.[0]?.current_product_id || null;
      const currentVariantId = String(subscription.shopify_variant_id);
      const currentProductId = subscription.shopify_product_id ? String(subscription.shopify_product_id) : null;

      // Ne créer un événement que s'il y a vraiment eu un changement
      if (previousVariantId && previousVariantId !== currentVariantId) {
        events.push({
          charge_id: null, // Pas de charge associé pour un changement de subscription
          subscription_id: String(subscription.id),
          customer_id: String(subscription.customer_id),
          original_scheduled_at: subscription.next_charge_scheduled_at,
          current_scheduled_at: subscription.next_charge_scheduled_at,
          status: subscription.status,
          event_type: 'subscription_product_change',
          created_at: new Date().toISOString(),
          updated_at: subscription.updated_at,
          // Champs de tracking des changements
          previous_product_id: previousProductId,
          current_product_id: currentProductId,
          previous_variant_id: previousVariantId,
          current_variant_id: currentVariantId,
          effective_date: subscription.updated_at,
          previous_quantity: null,
          current_quantity: subscription.quantity || null
        });
      }
    }

    if (events.length > 0) {
      const { error } = await supabase
        .from('recharge_events')
        .insert(events);

      if (error) {
        console.error('Supabase Error:', error);
        return res.status(500).json({ error: 'Database error' });
      }

      console.log(`Recorded ${events.length} product change event(s)`);
    } else {
      console.log('No product changes detected');
    }

    return res.status(200).json({ 
      success: true, 
      eventsRecorded: events.length 
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
