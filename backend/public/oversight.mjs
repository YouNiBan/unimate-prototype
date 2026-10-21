import {bindText,translateCurrent as t,currentLocale,observeUiAttributes} from './ui-i18n.mjs';
const element = (tag, text, className,localize=true) => {
  const node = document.createElement(tag);
  if (text !== undefined) bindText(node,text,localize);
  if (className) node.className = className;
  return node;
};
const button = (label, action, className) => {
  const node = element('button', label, className); node.type = 'button'; node.onclick = action; return node;
};
const serviceNames = { all: 'All services', cleaning: 'Cleaning', moving: 'Moving', airport_transfer: 'Airport transfers', other: 'Other bookings' };
const accessLabels = { student: 'Student app access', staff: 'Staff app access', no_account: 'App account not connected', unverified: 'Email confirmation pending', suspended: 'Account suspended' };
const money = row => row.pricingStatus === 'unquoted' ? 'Awaiting quote' : new Intl.NumberFormat(currentLocale(), { style: 'currency', currency: 'GBP' }).format(row.amount_pence / 100);

export async function renderOversight({ container, api, onOpenBooking, onOpenSupport }) {
  let service = 'all', role = 'all', query = '', page = 1, overviewVersion = 0, accountVersion = 0, detailVersion = 0;
  const header = element('header'), notice = element('p', undefined, 'banner');
  header.append(element('h1', 'App oversight'), element('p', 'Administrator review · Read only', 'muted'));
  bindText(notice,()=>'Review saved account, booking and support records. This view does not sign in as another person or automatically detect software bugs.');
  const overview = element('section'), accounts = element('section', undefined, 'panel'), detail = element('section');
  detail.setAttribute('aria-live', 'polite');
  container.replaceChildren(header, notice, overview, accounts, detail);
  function showError(target, error) { const message = element('p', error.message || 'This view could not be loaded.', 'banner'); message.setAttribute('role', 'alert'); target.replaceChildren(message); }
  async function openAccount(id) {
    const version = ++detailVersion;
    detail.replaceChildren(element('p', 'Loading account records…', 'muted'));
    try {
      const data = await api('oversight/accounts/' + encodeURIComponent(id));
      if (version !== detailVersion) return;
      const panel = element('section', undefined, 'panel'), heading = element('div', undefined, 'toolbar');
      heading.append(element('h2', data.account.name,undefined,false), button('Close review', () => { detailVersion++; detail.replaceChildren(); }));
      panel.append(heading, element('p', 'Administrator review · This account has not been impersonated.', 'muted'));
      const fields = element('dl', undefined, 'booking-detail-fields');
      for (const [label, value] of [
        ['Email', data.account.email], ['Record type', data.account.recordType], ['Recorded account kind', data.account.recordedKind],
        ['Status', data.account.status], ['Email verification', data.account.emailVerified ? 'Confirmed' : 'Not confirmed'],
        ['App access', accessLabels[data.account.appAccess] || data.account.appAccess],
        ['Active staff teams', data.account.staffTeams.length ? data.account.staffTeams.join(', ') : 'None'],
      ]) { const field = element('div'); field.append(element('dt', label), element('dd', value,undefined,false)); fields.append(field); }
      panel.append(fields);
      if (data.account.staffMemberships.length) {
        panel.append(element('h3', 'Staff membership state'));
        for (const member of data.account.staffMemberships) panel.append(element('p', `${member.team} · ${member.status}`, 'muted'));
      }
      if (data.account.recordType === 'organisation') panel.append(element('p', 'The organisation record is saved here. Its app workspace is not connected yet.', 'banner'));
      const bookings = (label, rows, total) => {
        panel.append(element('h3', `${label} · ${total}`));
        if (!rows.length) { panel.append(element('p', 'No linked bookings.', 'muted')); return; }
        const wrap = element('div', undefined, 'table-wrap'), table = element('table'), head = element('tr');
        for (const value of ['Booking', 'Service', 'Status', 'Price', 'Review']) head.append(element('th', value));
        table.append(head);
        for (const row of rows) {
          const line = element('tr'), review = element('td');
          for (const value of [row.title, serviceNames[row.service] || row.service, row.status.replaceAll('_', ' '), money(row)]) line.append(element('td', value,undefined,false));
          if (onOpenBooking) review.append(button('Open booking', () => onOpenBooking(row.id)));
          line.append(review); table.append(line);
        }
        wrap.append(table); panel.append(wrap);
        if (total > rows.length) panel.append(element('p', `Showing the latest ${rows.length} of ${total} bookings.`, 'muted'));
      };
      bookings('Owned bookings', data.ownedBookings, data.ownedTotal);
      bookings('Assigned bookings', data.assignedBookings, data.assignedTotal);
      panel.append(element('h3', 'Support references'));
      if (!data.support.available) panel.append(element('p', 'Shared support is not connected yet.', 'muted'));
      else if (!data.support.rows.length) panel.append(element('p', 'No linked support conversations.', 'muted'));
      else {
        panel.append(element('p', `${data.support.open} open · ${data.support.total} total. Message contents are available only in the support workspace.`, 'muted'));
        for (const row of data.support.rows) {
          const line = element('div', undefined, 'toolbar');
          line.append(element('span', `${row.category} · ${row.status}`), element('small', row.id, 'muted'));
          if (onOpenSupport) line.append(button('Open support', () => onOpenSupport(row.id)));
          panel.append(line);
        }
        if (data.support.total > data.support.rows.length) panel.append(element('p', `Showing the latest ${data.support.rows.length} references.`, 'muted'));
      }
      detail.replaceChildren(panel);
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { if (version === detailVersion) showError(detail, error); }
  }
  async function loadOverview() {
    const version = ++overviewVersion;
    overview.replaceChildren(element('p', 'Loading workflow overview…', 'muted'));
    try {
      const data = await api('oversight?' + new URLSearchParams({ service }));
      if (version !== overviewVersion) return;
      const filter = element('label', 'Service bookings'), select = element('select');
      for (const [value, title] of Object.entries(serviceNames)) { const option = element('option', title); option.value = value; select.append(option); }
      select.value = service; select.onchange = () => { service = select.value; loadOverview(); }; filter.append(select);
      const stats = element('div', undefined, 'stats');
      for (const [label, value] of [[`${data.serviceLabel} bookings`, data.counts.bookings], ['Active verified students', data.counts.activeVerifiedStudents], ['Active verified staff', data.counts.activeVerifiedStaff], ['Organisation records', data.counts.organisationRecords]]) {
        const card = element('div', undefined, 'stat'); card.append(element('span', label), element('strong', String(value))); stats.append(card);
      }
      const status = element('div', undefined, 'actions');
      for (const [name, count] of Object.entries(data.byStatus)) status.append(element('span', `${name.replaceAll('_', ' ')} · ${count}`, 'badge'));
      if (!Object.keys(data.byStatus).length) status.append(element('p', 'No booking records for this service.', 'muted'));
      const checks = element('div', undefined, 'oversight-checks');
      const issues = element('section', undefined, 'panel oversight-panel'); issues.append(element('h2', 'Workflow checks'), element('p', 'Booking checks follow your service filter. Accounts and support cover all services.', 'muted'));
      const activeChecks = data.issues.filter(issue => issue.count > 0).length;
      issues.append(element('p', activeChecks ? `${activeChecks} checks to review` : 'No items need review in these checks', 'oversight-summary' + (activeChecks ? ' needs-review' : '')));
      for (const issue of data.issues) {
        const section = element('details', undefined, 'oversight-row'), summary = element('summary');
        summary.append(element('span', issue.title,undefined,false), element('span', String(issue.count), 'oversight-count' + (issue.count ? ' needs-review' : '')));
        section.open = issue.count > 0;
        section.append(summary, element('p', issue.description, 'muted',false));
        for (const row of issue.rows) {
          const line = element('div', undefined, 'toolbar'); line.append(element('span', row.title,undefined,false), element('span', row.status.replaceAll('_', ' '), 'badge'));
          if (row.type === 'booking' && onOpenBooking) line.append(button('Review booking', () => onOpenBooking(row.id)));
          if (row.type === 'account') line.append(button('Review account', () => openAccount(row.id)));
          if (row.type === 'support' && onOpenSupport) line.append(button('Open support', () => onOpenSupport(row.id)));
          section.append(line);
        }
        if (issue.count > issue.rows.length) section.append(element('p', `Showing ${issue.rows.length} of ${issue.count}.`, 'muted'));
        issues.append(section);
      }
      const capability = element('section', undefined, 'panel oversight-panel'); capability.append(element('h2', 'App connections'), element('p', 'Select a connection to see what is available.', 'muted'));
      for (const item of data.capabilities) {
        const row = element('details', undefined, 'oversight-row'), summary = element('summary');
        summary.append(element('span', item.label), element('span', item.status === 'available' ? 'Connected' : 'Not connected', 'connection-state' + (item.status === 'available' ? ' connected' : '')));
        row.append(summary, element('p', item.detail, 'muted')); capability.append(row);
      }
      checks.append(issues, capability);
      overview.replaceChildren(filter, stats, status, checks);
    } catch (error) { if (version === overviewVersion) showError(overview, error); }
  }
  async function loadAccounts() {
    const version = ++accountVersion;
    accounts.replaceChildren(element('h2', 'Find an account'), element('p', 'Loading accounts…', 'muted'));
    try {
      const data = await api('oversight/accounts?' + new URLSearchParams({ q: query, role, page: String(page) }));
      if (version !== accountVersion) return;
      const form = element('form', undefined, 'search-form'), search = element('input'), select = element('select'), submit = element('button', 'Search');
      search.type = 'search'; search.placeholder = 'Name or email'; search.maxLength = 100; search.value = query; search.setAttribute('aria-label', 'Search accounts by name or email');
      select.setAttribute('aria-label', 'Account record type');
      for (const [value, title] of [['all', 'All account records'], ['student', 'Student records'], ['staff', 'Staff records'], ['seller','Seller records'], ['organisation', 'Organisation records']]) { const option = element('option', title); option.value = value; select.append(option); }
      select.value = role; form.append(search, select, submit);
      form.onsubmit = event => { event.preventDefault(); query = search.value.trim(); role = select.value; page = 1; loadAccounts(); };
      const wrap = element('div', undefined, 'table-wrap'), table = element('table'), head = element('tr');
      for (const label of ['Account', 'Record type', 'Verification', 'App access', 'Review']) head.append(element('th', label)); table.append(head);
      for (const account of data.rows) {
        const row = element('tr'), name = element('td'), action = element('td');
        name.append(element('strong', account.name,undefined,false), element('p', account.email,undefined,false)); action.append(button('Review account', () => openAccount(account.id)));
        row.append(name, element('td', account.recordType), element('td', account.emailVerified ? 'Confirmed' : 'Not confirmed'), element('td', accessLabels[account.appAccess] || account.appAccess), action); table.append(row);
      }
      wrap.append(table);
      const pager = element('div', undefined, 'pager');
      if (page > 1) pager.append(button('Previous', () => { page--; loadAccounts(); }));
      pager.append(element('span', ()=>t('{count} records · Page {page}',{count:data.total,page})));
      if (page * data.pageSize < data.total) pager.append(button('Next', () => { page++; loadAccounts(); }));
      accounts.replaceChildren(element('h2', 'Find an account'), form, wrap, ...(data.rows.length ? [] : [element('p', 'No account records match this search.', 'empty')]), pager);
    } catch (error) { if (version === accountVersion) showError(accounts, error); }
  }
  await Promise.all([loadOverview(), loadAccounts()]);
  return { refresh: () => Promise.all([loadOverview(), loadAccounts()]), dispose: () => { overviewVersion++; accountVersion++; detailVersion++; } };
}
