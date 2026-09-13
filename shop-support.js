(function(){'use strict';const url='https://vwxtjtixojubxlmshies.supabase.co',key='sb_publishable_kvAGmQmXhnYWf6li1Mn8lw_sPAN4Z2u';const c=window.supabase?.createClient?.(url,key);let cache=[];
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}function toast(m){if(window.toast)window.toast(m);else alert(m);}
async function openTicket(id){const r=await c.from('support_messages').select('*').eq('ticket_id',id).order('created_at');const text=(r.data||[]).map(x=>`[${x.sender_type}] ${x.message}`).join('\n\n');const msg=prompt('Ticket conversation:\n\n'+text+'\n\nReply (Cancel to skip):','');if(msg&&msg.trim()){const x=await c.rpc('add_support_message',{p_ticket_id:id,p_message:msg.trim()});if(x.error)toast(x.error.message);else await loadShopSupport(window.__shopSupportId);}}
async function status(id,current){const next=prompt('Status: OPEN / IN_REVIEW / WAITING_CUSTOMER / RESOLVED / ESCALATED / CLOSED',current||'IN_REVIEW');if(!next)return;const r=await c.rpc('set_support_ticket_status',{p_ticket_id:id,p_status:next.trim().toUpperCase()});if(r.error)toast(r.error.message);else await loadShopSupport(window.__shopSupportId);}
async function loadShopSupport(shopId){if(!c||!shopId)return;window.__shopSupportId=shopId;const t=await c.from('support_tickets').select('id,ticket_number,order_id,customer_name,customer_mobile,category,status,message,created_at').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(100);cache=t.data||[];const body=document.getElementById('shopSupportBody');if(body)body.innerHTML=cache.map(x=>`<tr><td>${esc(x.ticket_number||'-')}</td><td>${esc(x.order_id||'-')}</td><td>${esc(x.customer_name||x.customer_mobile||'-')}</td><td>${esc(x.category)}</td><td>${esc(x.status)}</td><td>${esc(x.message)}</td><td><button class="btn-sm primary-btn" onclick="window.shopReply('${x.id}')">Reply</button> <button class="btn-sm light-btn" onclick="window.shopStatus('${x.id}','${esc(x.status)}')">Status</button></td></tr>`).join('');const r=await c.from('refund_requests').select('order_id,amount,reason,status,created_at').eq('shop_id',shopId).order('created_at',{ascending:false}).limit(100);const rb=document.getElementById('shopRefundBody');if(rb)rb.innerHTML=(r.data||[]).map(x=>`<tr><td>${esc(x.order_id)}</td><td>₹${Number(x.amount||0).toFixed(2)}</td><td>${esc(x.reason)}</td><td>${esc(x.status)}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join('');}
window.shopReply=openTicket;window.shopStatus=status;window.loadShopSupport=loadShopSupport;})();
// Shop -> Super Admin helpdesk
async function loadShopHelp(shopId){
  if(!c||!shopId)return;
  window.__shopHelpId=shopId;
  const r=await c.from('support_tickets').select('id,ticket_number,category,subject,status,message,created_at,source').eq('shop_id',shopId).eq('source','SHOP').order('created_at',{ascending:false}).limit(100);
  const b=document.getElementById('shopHelpBody');
  if(b)b.innerHTML=(r.data||[]).map(x=>`<tr><td>${esc(x.ticket_number||'-')}</td><td>${esc(x.category||'-')}</td><td>${esc(x.subject||'-')}</td><td>${esc(x.status||'-')}</td><td>${esc(x.message||'-')}</td><td>${new Date(x.created_at).toLocaleString()}</td></tr>`).join('') || '<tr><td colspan="6">No requests yet.</td></tr>';
}
async function sendShopHelp(){
  if(!c||!window.__shopHelpId)return;
  const category=document.getElementById('shopHelpCategory')?.value||'OTHER';
  const subject=document.getElementById('shopHelpSubject')?.value.trim()||'';
  const message=document.getElementById('shopHelpMessage')?.value.trim()||'';
  const out=document.getElementById('shopHelpResult');
  if(!message){toast('अपनी समस्या लिखें');return;}
  const r=await c.rpc('create_shop_support_ticket',{p_shop_id:window.__shopHelpId,p_category:category,p_subject:subject,p_message:message});
  if(r.error){toast('Ticket failed: '+r.error.message);return;}
  if(out)out.textContent='Ticket created: '+r.data;
  document.getElementById('shopHelpSubject').value='';document.getElementById('shopHelpMessage').value='';
  await loadShopHelp(window.__shopHelpId);
}
window.loadShopHelp=loadShopHelp;
document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{const b=document.getElementById('sendShopHelp');if(b)b.onclick=sendShopHelp;},1000);});
