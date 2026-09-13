(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  function cfg(){return window.supabaseClient || window.db || window.supabaseDb || window.supabaseClientInstance || null;}
  function getClient(){
    if(window.supabase && window.supabase.createClient && !window.__supportClient){
      const url='https://vwxtjtixojubxlmshies.supabase.co';
      const key='sb_publishable_kvAGmQmXhnYWf6li1Mn8lw_sPAN4Z2u';
      window.__supportClient=window.supabase.createClient(url,key);
    }
    return cfg() || window.__supportClient;
  }
  async function submit(){
    const client=getClient(); if(!client) return alert('Support service unavailable.');
    const shopId=new URLSearchParams(location.search).get('shop') || window.shopUuid || '';
    const order=($('supportOrderId')?.value||'').trim(); const mobile=($('supportMobile')?.value||'').trim();
    const category=$('supportCategory')?.value||'OTHER'; const subject=($('supportSubject')?.value||'').trim(); const message=($('supportMessage')?.value||'').trim(); const name=($('supportName')?.value||'').trim();
    if(!shopId||!message) return alert('Shop और समस्या की जानकारी जरूरी है।');
    const {data,error}=await client.rpc('create_customer_ticket',{p_shop_id:shopId,p_order_number:order||null,p_mobile:mobile||null,p_name:name||null,p_category:category,p_subject:subject||null,p_message:message});
    if(error) return alert(error.message||'Ticket create नहीं हुआ।');
    alert('Support Ticket: '+data+'\nइसे सुरक्षित रखें।');
    $('supportMessage').value='';
  }
  window.submitCustomerSupport=submit;
})();
