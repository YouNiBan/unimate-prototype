import {bindText,translateCurrent as t,currentLocale,observeUiAttributes} from './ui-i18n.mjs';
const element=(tag,text,cls,localize=true)=>{const node=document.createElement(tag);if(text!==undefined)bindText(node,text,localize);if(cls)node.className=cls;return node;};
export async function renderPayments({container,api,onOpenBooking,mode='payments'}){
  let page=1,generation=0;
  const panel=element('section',undefined,'panel');container.append(panel);
  const button=(label,action)=>{const node=element('button',label);node.type='button';node.onclick=action;return node;};
  async function load(){
    const version=++generation;panel.replaceChildren(element('p','Loading payment records…','muted'));
    try{
      const data=await api('payments?page='+page);if(version!==generation||!panel.isConnected)return;
      panel.replaceChildren(element('h2',mode==='fees'?'Fees & Stripe':'Payment history'),element('p',data.enabled?'Stripe test mode · These records never represent real money.':'Stripe is not connected. Checkout is disabled.','banner'));
      if(mode==='fees')panel.append(element('p','Service booking checkout is prepared for local testing. Ticket inventory and independent marketplace sellers are not connected yet. Staff invoices are reviewed separately.','muted'),button('Refresh',()=>load()));
      if(mode==='fees'){renderFees(data.feePolicy);return;}
      if(!data.rows.length)panel.append(element('p','No test payment records yet.','empty'));
      else{
        const wrap=element('div',undefined,'table-wrap'),table=element('table'),head=element('tr');
        for(const label of ['UniMate reference','Booking','Test amount','UniMate fee','Partner share','Stripe costs / net earnings','Status','Stripe match','Updated','Review'])head.append(element('th',label));table.append(head);
        for(const row of data.rows){
          const tr=element('tr'),action=element('td');
          const money=value=>new Intl.NumberFormat(currentLocale(),{style:'currency',currency:'GBP'}).format(value/100);
          tr.append(element('td',row.reference,undefined,false),element('td',row.bookingId,undefined,false),element('td',money(row.amountPence),undefined,false));
          for(const key of ['commissionPence','partnerSharePence'])tr.append(row.feeAllocation?element('td',money(row.feeAllocation[key]),undefined,false):element('td','Not recorded'));
          tr.append(element('td','Awaiting reconciliation'),element('td',row.status.replaceAll('_',' ')),element('td',row.stripePaymentIntentId||row.stripeSessionId||'Awaiting checkout',undefined,false),element('td',new Date(row.updatedAt).toLocaleString(currentLocale()),undefined,false));
          action.append(button('Open booking',()=>onOpenBooking(row.bookingId)));tr.append(action);table.append(tr);
        }
        wrap.append(table);panel.append(wrap);
        panel.append(element('p','Fee allocations are saved with each checkout and do not change when rates change. A paid status confirms the test payment only; it does not confirm a provider payout.','muted'));
      }
      const pager=element('div',undefined,'pager');
      if(page>1)pager.append(button('Previous',()=>{page--;load();}));
      pager.append(element('span',()=>t('{count} records · Page {page}',{count:data.total,page})));
      if(page*25<data.total)pager.append(button('Next',()=>{page++;load();}));
      panel.append(pager);
    }catch(error){if(version===generation&&panel.isConnected)panel.replaceChildren(element('p',error.message,'banner'),button('Try again',()=>load()));}
  }
  function renderFees(policy){
    if(!policy?.rows)return;
    const section=element('section',undefined,'fee-policy'),wrap=element('div',undefined,'table-wrap'),table=element('table');
    section.append(element('h3','Agreed UniMate fees'),element('p','Stripe processing comes from UniMate’s share. These rates do not add a customer booking surcharge.','muted'));
    const head=element('tr');for(const label of ['Category','UniMate fee','Calculated on','Billing'])head.append(element('th',label));table.append(head);
    for(const row of policy.rows){
      const tr=element('tr');
      tr.append(element('td',row.label),element('td',row.rateBps!==undefined?`${row.rateBps/100}%`:'£1 per attended guest'),element('td',row.basis),element('td',row.billing));
      table.append(tr);
    }
    wrap.append(table);section.append(wrap,element('p','UniMate-owned products are separate. Event and restaurant rates require partner agreement. Live partner charges, monthly restaurant invoices and payouts are not enabled yet.','muted'));
    const details=element('details'),summary=element('summary','Check a fee breakdown'),form=element('form',undefined,'fee-quote-form');
    details.append(summary,form);
    const categoryLabel=element('label','Category'),category=element('select');category.setAttribute('aria-label',t('Category'));
    for(const row of policy.rows){const option=element('option',row.label);option.value=row.kind;category.append(option);}categoryLabel.append(category);
    const field=(name,label,value,step)=>{
      const wrapper=element('label',label),input=element('input');input.type='number';input.min='0';input.max=name==='guests'?'100000':'100000';input.step=step;input.value=value;input.required=true;wrapper.append(input);return {wrapper,input};
    };
    const amount=field('amount','Sale or booking price (£)','20','0.01'),delivery=field('delivery','Separate delivery (£)','0','0.01'),guests=field('guests','Guests who attended','1','1');
    const submit=element('button','Calculate fee');submit.type='submit';
    const result=element('div',undefined,'fee-quote-result');result.setAttribute('aria-live','polite');
    form.append(categoryLabel,amount.wrapper,delivery.wrapper,guests.wrapper,submit);
    details.append(result,element('p','Preview only. No payment, invoice or payout is created. Actual Stripe costs and net earnings appear only after reconciliation.','muted'));
    let quoteGeneration=0;
    const update=()=>{
      quoteGeneration++;submit.disabled=false;result.replaceChildren();
      const reservation=category.value==='restaurant_reservation';
      amount.wrapper.hidden=reservation;amount.input.disabled=reservation;
      delivery.wrapper.hidden=category.value!=='marketplace';delivery.input.disabled=category.value!=='marketplace';
      guests.wrapper.hidden=!reservation;guests.input.disabled=!reservation;
    };
    category.onchange=update;form.oninput=()=>{quoteGeneration++;submit.disabled=false;result.replaceChildren();};update();
    form.onsubmit=async event=>{
      event.preventDefault();const attempt=++quoteGeneration;submit.disabled=true;
      try{
        const pence=input=>{
          if(!/^\d+(\.\d{1,2})?$/.test(input.value))throw Error(t('Enter a price with no more than two decimal places.'));
          const [whole,fraction='']=input.value.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
        };
        const params=new URLSearchParams({kind:category.value,amountPence:String(amount.input.disabled?0:pence(amount.input)),deliveryPence:String(delivery.input.disabled?0:pence(delivery.input)),attendedGuests:guests.input.disabled?'0':guests.input.value});
        const {quote}=await api('payments/fees/quote?'+params);
        if(attempt!==quoteGeneration||!section.isConnected)return;
        result.replaceChildren();
        const money=value=>new Intl.NumberFormat(currentLocale(),{style:'currency',currency:'GBP'}).format(value/100);
        const rows=quote.restaurantDuePence!==null
          ? [['Restaurant monthly referral fee',quote.restaurantDuePence],['Customer reservation fee',0]]
          : [['Customer total',quote.customerTotalPence],['UniMate share before processing costs',quote.commissionPence],['Partner share before other adjustments',quote.partnerSharePence]];
        if(quote.deliveryPence)rows.push(['Delivery excluded from commission',quote.deliveryPence]);
        for(const [label,value] of rows){const line=element('p');line.append(element('span',label),document.createTextNode(' · '),element('strong',()=>money(value),undefined,false));result.append(line);}
        result.append(element('p','Stripe costs are not deducted again from the partner share.','muted'));
      }catch(error){if(attempt===quoteGeneration&&section.isConnected)result.replaceChildren(element('p',error.message,'banner'));}
      finally{if(attempt===quoteGeneration)submit.disabled=false;}
    };
    section.append(details);panel.append(section);
  }
  await load();
}
