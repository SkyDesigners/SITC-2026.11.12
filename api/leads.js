const crypto = require('node:crypto');
const save = require('../integrations/cloud-leads');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({error:'Method not allowed'}); }
  const p = req.body;
  const required = ['full_name','whatsapp_number','district','age','qualification','study_mode','programme','start_timeline','funding','preferred_language'];
  if (!p || typeof p !== 'object' || required.some(k => typeof p[k] !== 'string' || !p[k].trim() || p[k].length > 300) || p.consent !== true || !/^\+947\d{8}$/.test(p.whatsapp_number) || typeof p.event_id !== 'string' || !/^[\w-]{1,100}$/.test(p.event_id)) return res.status(400).json({error:'Please check the required fields'});
  if (!process.env.META_CAPI_TOKEN || !/^\d+$/.test(process.env.META_PIXEL_ID || '')) return res.status(503).json({error:'Tracking is not configured'});
  let id;
  try { id = await save(p); } catch { return res.status(503).json({error:'Unable to save your request. Please try again.'}); }
  const user_data = {ph:[hash(p.whatsapp_number.replace(/\D/g,''))], client_user_agent: String(req.headers['user-agent'] || '').slice(0,500)};
  if (p.email && typeof p.email === 'string') user_data.em = [hash(p.email.trim().toLowerCase())];
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (ip) user_data.client_ip_address = ip;
  if (typeof p.fbp === 'string' && p.fbp.length < 256 && p.fbp) user_data.fbp = p.fbp;
  if (typeof p.fbc === 'string' && p.fbc.length < 256 && p.fbc) user_data.fbc = p.fbc;
  const event = {event_name:'Lead',event_time:Math.floor(Date.now()/1000),event_id:p.event_id,action_source:'website',event_source_url:typeof p.page_url === 'string' ? p.page_url.split('?')[0] : 'https://malaysia.sitc.lk/',user_data,custom_data:{content_name:p.programme}};
  const body = {data:[event],access_token:process.env.META_CAPI_TOKEN};
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  try {
    const response = await fetch(`https://graph.facebook.com/v25.0/${process.env.META_PIXEL_ID}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if (!response.ok) console.error('Meta CAPI request failed:',response.status);
  } catch { console.error('Meta CAPI request failed'); }
  return res.status(201).json({ok:true,id});
};
