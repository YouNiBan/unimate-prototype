import {bindText,translateCurrent as t,currentLocale,observeUiAttributes} from './ui-i18n.mjs';
const element = (tag, text, className,localize=true) => {
  const node = document.createElement(tag);
  if (text !== undefined) bindText(node,text,localize);
  if (className) node.className = className;
  return node;
};
const button = (text, action, className) => {
  const node = element('button', text, className); node.type = 'button'; node.onclick = action; return node;
};
const money = amount => new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'GBP' }).format(amount / 100);
const names = { pending: 'Work awaiting review', changes_requested: 'Changes requested', approved: 'Work approved', awaiting_invoice_review: 'Invoice awaiting review', approved_for_payment: 'Approved for payment', superseded: 'Replaced by a revised invoice' };
const serviceNames = { cleaning: 'Cleaning', moving: 'Moving', airport_transfer: 'Airport transfer' };

export async function renderStaffInvoices({ container, api, onOpenBooking }) {
  let status = 'all', page = 1, version = 0, query='', department='all';
  const heading = element('header'), notice = element('p', 'Review completed work, then review the staff invoice issued to UniMate. Staff fees are entered separately from the customer booking price. Approval records readiness for payment; it does not send money.', 'banner');
  heading.append(element('h1', 'Staff invoices'), element('p', 'Completed work → Work review → Invoice review', 'muted'));
  const content = element('section');
  container.replaceChildren(heading, notice, content);
  const errorMessage = (target, error) => {
    const message = element('p', error.message || 'The review could not be saved.', 'banner');
    message.setAttribute('role', 'alert'); target.replaceChildren(message);
  };
  function reviewForm(row, stage) {
    const form = element('form'), message = element('div'), reasonLabel = element('label', 'Review note'), reason = element('textarea');
    reason.name = 'reason'; reason.required = true; reason.minLength = 5; reason.maxLength = 1000; reasonLabel.append(reason);
    let amount;
    if (stage === 'work') {
      const label = element('label', 'Agreed staff fee (£)');
      amount = element('input'); amount.name = 'fee'; amount.type = 'text'; amount.inputMode = 'decimal'; amount.placeholder = 'Enter the agreed amount';
      if (row.invoice?.status === 'changes_requested') amount.value = (row.invoice.amountPence / 100).toFixed(2);
      label.append(amount); form.append(label, element('p', 'Enter the agreed payment for this staff member’s work. This is separate from the amount charged to the customer.', 'muted'));
    }
    const actions = element('div', undefined, 'actions'), approve = element('button', stage === 'work' ? 'Approve work & prepare invoice' : 'Approve invoice for payment', 'primary'), changes = element('button', 'Request changes');
    approve.type = changes.type = 'submit'; approve.value = 'approve'; changes.value = 'changes_requested';
    actions.append(approve, changes); form.append(reasonLabel, actions, message);
    form.onsubmit = async event => {
      event.preventDefault(); message.replaceChildren();
      const decision = event.submitter?.value;
      if (!decision) return;
      const payload = { decision, reason: reason.value, expectedStatus: stage === 'work' ? row.workStatus : row.invoice.status };
      if (stage === 'invoice') payload.expectedInvoiceId = row.invoice.id;
      if (stage === 'work' && decision === 'approve') {
        const value = amount.value.trim();
        if (!/^\d+(?:\.\d{1,2})?$/.test(value)) { errorMessage(message, Error('Enter the agreed fee with up to two decimal places.')); return; }
        const [whole, decimal = ''] = value.split('.');
        payload.amountPence = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
        if (!Number.isSafeInteger(payload.amountPence)) { errorMessage(message, Error('Enter a valid staff fee.')); return; }
      }
      approve.disabled = changes.disabled = true;
      try { await api(`staff-invoices/${encodeURIComponent(row.bookingId)}/review-${stage}`, payload); await load(); }
      catch (error) { errorMessage(message, error); approve.disabled = changes.disabled = false; }
    };
    return form;
  }
  function card(row) {
    const panel = element('section', undefined, 'panel'), title = element('div', undefined, 'toolbar');
    title.append(element('h2', row.title,undefined,false), element('span', names[row.invoice?.status] || names[row.workStatus], 'badge'));
    panel.append(title, element('p', `${row.staff.name} · ${serviceNames[row.service] || row.service} · ${row.jobDate}`,undefined,false));
    if (onOpenBooking) panel.append(button('Review booking and photos', () => onOpenBooking(row.bookingId)));
    if (row.invoice) {
      const invoice = row.invoice, fields = element('dl', undefined, 'booking-detail-fields');
      for (const [label, value] of [['Staff invoice', invoice.reference], ['Issued to', invoice.billTo], ['Agreed staff fee', money(invoice.amountPence)], ['Revision', String(invoice.revision)], ['Issued', new Date(invoice.issuedAt).toLocaleDateString(currentLocale())]]) {
        const item = element('div'); item.append(element('dt', label), element('dd', value,undefined,false)); fields.append(item);
      }
      panel.append(fields);
      if (invoice.reviewReason) panel.append(element('p', `Invoice review note: ${invoice.reviewReason}`, 'muted'));
    } else panel.append(element('p', 'Staff fee not set. No staff invoice has been issued.', 'muted'));
    if (row.reviewReason) panel.append(element('p', `Work review note: ${row.reviewReason}`, 'muted'));
    if (['pending', 'changes_requested'].includes(row.workStatus)) {
      panel.append(element('h3', '1. Review completed work'), reviewForm(row, 'work'));
    } else if (row.invoice?.status === 'awaiting_invoice_review') {
      panel.append(element('h3', '2. Review staff invoice'), element('p', 'Check the recipient, work details and agreed fee before approving.', 'muted'), reviewForm(row, 'invoice'));
    } else if (row.invoice?.status === 'approved_for_payment') {
      panel.append(element('p', 'Approved for payment. No payment has been made through this system.', 'banner'));
    }
    return panel;
  }
  async function load() {
    const current = ++version;
    content.replaceChildren(element('p', 'Loading staff work and invoices…', 'muted'));
    try {
      const data = await api('staff-invoices?' + new URLSearchParams({ status, page: String(page), q:query, department }));
      if (version !== current) return;
      const stats = element('div', undefined, 'stats');
      for (const [label, count] of [['Work awaiting review', data.counts.pendingWork], ['Changes requested', data.counts.changesRequested], ['Invoice awaiting review', data.counts.awaitingInvoiceReview], ['Approved for payment', data.counts.approvedForPayment]]) {
        const item = element('div', undefined, 'stat'); item.append(element('span', label), element('strong', String(count))); stats.append(item);
      }
      const label = element('label', 'Show'), select = element('select');
      for (const [value, title] of [['all', 'All completed work'], ['pending_work', 'Work awaiting review'], ['changes_requested', 'Changes requested'], ['awaiting_invoice_review', 'Invoice awaiting review'], ['approved_for_payment', 'Approved for payment']]) {
        const option = element('option', title); option.value = value; select.append(option);
      }
      select.value = status; select.onchange = () => { status = select.value; page = 1; load(); }; label.append(select);
      const filters=element('form',undefined,'invoice-filters'),searchLabel=element('label','Staff name or invoice reference'),search=element('input'),departmentLabel=element('label','Department'),departmentSelect=element('select');
      search.type='search';search.value=query;search.maxLength=100;searchLabel.append(search);
      for(const [value,title]of [['all','All departments'],...Object.entries(serviceNames)]){const option=element('option',title);option.value=value;departmentSelect.append(option);}
      departmentSelect.value=department;departmentLabel.append(departmentSelect);departmentSelect.onchange=()=>{department=departmentSelect.value;query=search.value.trim();page=1;load();};
      const apply=element('button','Search');apply.type='submit';filters.append(searchLabel,departmentLabel,label,apply);filters.onsubmit=event=>{event.preventDefault();query=search.value.trim();page=1;load();};
      const pager = element('div', undefined, 'pager');
      if (page > 1) pager.append(button('Previous', () => { page--; load(); }));
      pager.append(element('span', ()=>t('{count} records · Page {page}',{count:data.total,page})));
      if (page * data.pageSize < data.total) pager.append(button('Next', () => { page++; load(); }));
      content.replaceChildren(stats, filters, ...(data.rows.length ? data.rows.map(card) : [element('p', 'No completed staff work matches this view.', 'empty')]), pager);
    } catch (error) { if (version === current) errorMessage(content, error); }
  }
  await load();
  return { refresh: load, dispose() { version++; } };
}
