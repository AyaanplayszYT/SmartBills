// SmartBills 2.0 - frontend-only app
// Features: dark mode, responsive, recurring invoices, reminders, PDF gen, export/import, localStorage
import './style.css';

const KEYS = {
  invoices: 'sb2_invoices_v1',
  payments: 'sb2_payments_v1',
  settings: 'sb2_settings_v1'
};

// utils
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const load = k => JSON.parse(localStorage.getItem(k) || '[]');
const save = (k,v) => localStorage.setItem(k, JSON.stringify(v));
const settingsLoad = () => JSON.parse(localStorage.getItem(KEYS.settings) || '{}');
const settingsSave = s => localStorage.setItem(KEYS.settings, JSON.stringify(s));

// initial setup
document.addEventListener('DOMContentLoaded', () => {
  initViews();
  initUI();
  renderAll();
  applyThemeFromSettings();
  startReminderChecker(); // background checker for reminders
});

// VIEW NAV
function initViews(){
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => {
    $$('.nav-btn').forEach(n=>n.classList.remove('active'));
    b.classList.add('active');
    const view = b.dataset.view;
    $$('.view').forEach(v=>v.classList.remove('active'));
    $(`#view${capitalize(view)}`).classList.add('active');
  }));
}

// UI bindings
function initUI(){
  $('#newInvoiceBtn').addEventListener('click', ()=> openModal('#modalInvoice','new'));
  $('#btnAddInvoice')?.addEventListener('click', ()=> openModal('#modalInvoice','new'));
  $('#addPaymentBtn')?.addEventListener('click', ()=> openModal('#modalPayment'));
  $('#saveInvoice').addEventListener('click', saveInvoice);
  $('#saveCard').addEventListener('click', saveCard);
  $$('.modal [data-close]').forEach(b=>b.addEventListener('click', ()=> closeModal(b.closest('.modal'))));
  $$('.modal').forEach(m=> m.addEventListener('click', e=> { if(e.target===m) closeModal(m); }));
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#themeToggle2').addEventListener('click', toggleTheme);
  $('#enableNotifs').addEventListener('change', toggleNotifications);
  $('#exportAllBtn').addEventListener('click', exportAll);
  $('#exportJson').addEventListener('click', exportAll);
  $('#importFile').addEventListener('change', importFile);
  $('#resetBtn').addEventListener('click', resetAll);
  $('#downloadAllPdf').addEventListener('click', downloadAllPdfs);
  $('#btnBulkPdf')?.addEventListener('click', downloadAllPdfs);
  $('#exportPayments')?.addEventListener('click', exportPayments);

  $('#search').addEventListener('input', renderInvoicesList);
  $('#filterClient')?.addEventListener('input', renderInvoicesList);

  // init settings control
  const s = settingsLoad();
  $('#enableNotifs').checked = !!s.enableNotifs;
}

// THEMES
function applyThemeFromSettings(){
  const s = settingsLoad();
  if(s.theme === 'dark' || (!s.theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)){
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
}

function toggleTheme(){
  document.body.classList.toggle('dark');
  const s = settingsLoad();
  s.theme = document.body.classList.contains('dark') ? 'dark' : 'light';
  settingsSave(s);
}

// MODALS
function openModal(sel, mode='') {
  const m = document.querySelector(sel);
  if(!m) return;
  if(sel === '#modalInvoice'){
    $('#modalTitle').innerText = mode === 'edit' ? 'Edit invoice' : 'New invoice';
    if(mode === 'edit' && openModal.editing) populateInvoiceForm(openModal.editing);
    else clearInvoiceForm();
  }
  if(sel === '#modalPayment'){
    $('#modalTitle').innerText = 'Add payment method';
    clearCardForm();
  }
  m.style.display = 'flex';
}
function closeModal(m){ if(!m) return; m.style.display='none'; openModal.editing = null; }

function clearCardForm(){
  $('#cardName').value = '';
  $('#cardLast4').value = '';
  $('#cardExpiry').value = '';
}

// INVOICE CRUD
function saveInvoice(){
  const client = $('#invClient').value.trim();
  const amount = parseFloat($('#invAmount').value);
  const due = $('#invDue').value;
  const recur = $('#invRecurrence').value;
  const notes = $('#invNotes').value.trim();

  if(!client || isNaN(amount) || !due){ alert('Enter client, amount and due date'); return; }

  const invoices = load(KEYS.invoices);
  if(openModal.editing){
    // update
    const idx = invoices.findIndex(i=>i.id === openModal.editing);
    if(idx === -1) return;
    invoices[idx].client = client;
    invoices[idx].amount = +amount.toFixed(2);
    invoices[idx].due = due;
    invoices[idx].recurrence = recur;
    invoices[idx].notes = notes;
    invoices[idx].updatedAt = new Date().toISOString();
  } else {
    const inv = {
      id: uid(),
      client, amount: +amount.toFixed(2), due,
      recurrence: recur, notes, paid: false,
      createdAt: new Date().toISOString()
    };
    invoices.unshift(inv);
  }
  save(KEYS.invoices, invoices);
  closeModal($('#modalInvoice'));
  renderAll();

  // Auto-generate PDF for new invoice
  if(!openModal.editing) {
    const newest = load(KEYS.invoices)[0];
    setTimeout(()=> generateInvoicePdf(newest), 300);
  }
}

// populate / clear form
function populateInvoiceForm(id){
  const inv = load(KEYS.invoices).find(i=>i.id===id);
  if(!inv) return;
  $('#invClient').value = inv.client;
  $('#invAmount').value = inv.amount;
  $('#invDue').value = inv.due;
  $('#invRecurrence').value = inv.recurrence || 'none';
  $('#invNotes').value = inv.notes || '';
  openModal.editing = id;
}
function clearInvoiceForm(){
  $('#invClient').value = '';
  $('#invAmount').value = '';
  $('#invDue').value = '';
  $('#invRecurrence').value = 'none';
  $('#invNotes').value = '';
}

// RENDERING
function renderAll(){
  renderStats();
  renderRecent();
  renderInvoicesList();
  renderPayments();
  renderReminders();
}

function renderStats(){
  const invoices = load(KEYS.invoices);
  $('#statInvoices').innerText = invoices.length;
  const paid = invoices.filter(i=>i.paid).reduce((s,i)=>s+i.amount,0);
  const outstanding = invoices.filter(i=>!i.paid).reduce((s,i)=>s+i.amount,0);
  $('#statPaid').innerText = `$${paid.toFixed(2)}`;
  $('#statOutstanding').innerText = `$${outstanding.toFixed(2)}`;
  // next due
  const upcoming = invoices.filter(i=> !i.paid).sort((a,b)=> new Date(a.due)-new Date(b.due));
  $('#statNextDue').innerText = upcoming.length ? `${upcoming[0].client} • ${formatDate(upcoming[0].due)}` : '—';
}

function renderRecent(){
  const list = load(KEYS.invoices);
  const wrap = $('#recentInvoices');
  if(!wrap) return;
  if(list.length === 0){ wrap.innerHTML = '<div class="muted">No invoices yet.</div>'; return; }
  wrap.innerHTML = '';
  list.slice(0,6).forEach(inv => {
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div>
      <div style="font-weight:700">${inv.client} <span class="muted">• ${formatDate(inv.due)}</span></div>
      <div class="meta">${inv.notes ? inv.notes : ''}</div>
    </div>
    <div class="row">
      ${inv.paid ? '<div class="tiny">Paid</div>' : `<div style="font-weight:700">$${inv.amount.toFixed(2)}</div>`}
      <button class="btn ghost btn-view" data-id="${inv.id}">View</button>
      <button class="btn outline btn-pdf" data-id="${inv.id}">PDF</button>
    </div>`;
    wrap.appendChild(el);
  });

  // attach
  $$('.btn-pdf').forEach(b=> b.addEventListener('click', e=> {
    const id = e.target.dataset.id;
    const inv = load(KEYS.invoices).find(i=>i.id===id);
    generateInvoicePdf(inv);
  }));
  $$('.btn-view').forEach(b=> b.addEventListener('click', e=> {
    const id = e.target.dataset.id;
    openInvoiceActions(id);
  }));
}

function renderInvoicesList(){
  const list = load(KEYS.invoices);
  const term = ($('#search')?.value || '').toLowerCase();
  const clientFilter = ($('#filterClient')?.value || '').toLowerCase();
  const wrap = $('#invoicesList');
  if(!wrap) return;
  let filtered = list;
  if(term) filtered = filtered.filter(i => i.client.toLowerCase().includes(term) || (i.notes||'').toLowerCase().includes(term));
  if(clientFilter) filtered = filtered.filter(i => i.client.toLowerCase().includes(clientFilter));
  if(filtered.length === 0){ wrap.innerHTML = '<div class="muted">No invoices match.</div>'; return; }
  wrap.innerHTML = '';
  filtered.forEach(inv => {
    const dueDate = new Date(inv.due);
    const dueSoon = !inv.paid && daysBetween(new Date(), dueDate) <= 3;
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div>
      <div style="font-weight:700">${inv.client} <span class="muted">• ${formatDate(inv.due)}</span></div>
      <div class="meta">${inv.notes||''}</div>
    </div>
    <div class="row">
      <div style="text-align:right">
        <div style="font-weight:700">$${inv.amount.toFixed(2)}</div>
        <div class="muted" style="font-size:12px">${inv.recurrence !== 'none' ? 'recurring • '+inv.recurrence : ''}</div>
      </div>
      ${inv.paid ? '<div class="tiny">Paid</div>' : `<button class="btn primary btn-mark" data-id="${inv.id}">Mark paid</button>`}
      <button class="btn outline btn-edit" data-id="${inv.id}">Edit</button>
      <button class="btn ghost btn-del" data-id="${inv.id}">Delete</button>
      <button class="btn outline btn-pdf" data-id="${inv.id}">PDF</button>
    </div>`;
    if(dueSoon) el.style.borderLeft = '4px solid #e07a5f';
    wrap.appendChild(el);
  });

  // attach controls
  $$('.btn-mark').forEach(b => b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    markPaid(id);
  }));
  $$('.btn-edit').forEach(b => b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    openModal('#modalInvoice','edit');
    openModal.editing = id;
    populateInvoiceForm(id);
  }));
  $$('.btn-del').forEach(b => b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    if(!confirm('Delete invoice?')) return;
    deleteInvoice(id);
  }));
  $$('.btn-pdf').forEach(b => b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    const inv = load(KEYS.invoices).find(i=>i.id===id);
    generateInvoicePdf(inv);
  }));
}

// payments
function saveCard(){
  const name = $('#cardName').value.trim();
  const last4 = $('#cardLast4').value.trim();
  const expiry = $('#cardExpiry').value.trim();
  if(!name || !last4){ alert('Enter card name and last4'); return; }
  const list = load(KEYS.payments);
  list.unshift({ id: uid(), name, last4, expiry });
  save(KEYS.payments, list);
  closeModal($('#modalPayment'));
  renderPayments();
}
function renderPayments(){
  const wrap = $('#paymentsList');
  const list = load(KEYS.payments);
  if(!wrap) return;
  if(list.length === 0){ wrap.innerHTML = '<div class="muted">No payment methods.</div>'; return; }
  wrap.innerHTML = '';
  list.forEach(p => {
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div><div style="font-weight:700">${p.name} • •••• ${p.last4}</div><div class="muted">${p.expiry||''}</div></div>
      <div class="row"><button class="btn ghost btn-delcard" data-id="${p.id}">Delete</button></div>`;
    wrap.appendChild(el);
  });
  $$('.btn-delcard').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    const list = load(KEYS.payments).filter(x=>x.id!==id);
    save(KEYS.payments, list); renderPayments();
  }));
}

// invoice actions
function openInvoiceActions(id){
  const inv = load(KEYS.invoices).find(i=>i.id===id);
  if(!inv) return;
  // small quick menu: edit / pdf / mark paid / delete
  const opts = ['Edit','PDF','Mark paid','Delete','Cancel'];
  const choice = prompt(`Invoice: ${inv.client}\n1 Edit\n2 PDF\n3 Mark paid\n4 Delete\nEnter number:`);
  if(!choice) return;
  const n = parseInt(choice);
  if(n===1) { openModal('#modalInvoice','edit'); openModal.editing = id; populateInvoiceForm(id); }
  if(n===2) generateInvoicePdf(inv);
  if(n===3) markPaid(id);
  if(n===4) { if(confirm('Delete invoice?')) deleteInvoice(id); }
}

// mark paid
function markPaid(id){
  const list = load(KEYS.invoices);
  const idx = list.findIndex(i=>i.id===id);
  if(idx===-1) return;
  list[idx].paid = true;
  list[idx].paidAt = new Date().toISOString();
  // if recurring, make next invoice
  if(list[idx].recurrence && list[idx].recurrence !== 'none'){
    const nextDue = nextDate(list[idx].due, list[idx].recurrence);
    const clone = {...list[idx], id: uid(), due: nextDue, paid:false, createdAt: new Date().toISOString() };
    delete clone.paidAt;
    list.unshift(clone);
  }
  save(KEYS.invoices, list);
  renderAll();
}

// delete
function deleteInvoice(id){
  const list = load(KEYS.invoices).filter(i=>i.id!==id);
  save(KEYS.invoices, list);
  renderAll();
}

// reminders / due soon
function daysBetween(a,b){ return Math.ceil((b - a)/(1000*60*60*24)); }
function nextDate(dateStr, recur){
  const d = new Date(dateStr);
  if(recur==='daily') d.setDate(d.getDate()+1);
  if(recur==='weekly') d.setDate(d.getDate()+7);
  if(recur==='monthly') d.setMonth(d.getMonth()+1);
  return d.toISOString().slice(0,10);
}

function renderReminders(){
  const list = load(KEYS.invoices);
  const upcoming = list.filter(i=>!i.paid && daysBetween(new Date(), new Date(i.due)) <= 7).sort((a,b)=> new Date(a.due)-new Date(b.due));
  const wrap = $('#remindersList');
  if(!wrap) return;
  if(upcoming.length===0) { wrap.innerHTML = '<div class="muted">No upcoming due invoices.</div>'; return; }
  wrap.innerHTML = '';
  upcoming.forEach(i => {
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div><div style="font-weight:700">${i.client}</div><div class="muted">${formatDate(i.due)} • $${i.amount.toFixed(2)}</div></div>
      <div class="row"><button class="btn outline btn-rem-pdf" data-id="${i.id}">PDF</button></div>`;
    wrap.appendChild(el);
  });
  $$('.btn-rem-pdf').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id; const inv = load(KEYS.invoices).find(x=>x.id===id); generateInvoicePdf(inv);
  }));
}

// reminders checker
let reminderInterval = null;
function startReminderChecker(){
  if(reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(()=> {
    // check for due today or overdue
    const list = load(KEYS.invoices);
    const now = new Date();
    const notifyEnabled = settingsLoad().enableNotifs;
  list.forEach(inv => {
      if(!inv.paid){
        const days = daysBetween(new Date(), new Date(inv.due));
        if(days <= 0){
          // if not previously notified, notify and mark a flag
          if(!inv._notified){
            inv._notified = true;
            if(notifyEnabled) {
              try { new Notification(`Invoice due: ${inv.client}`, { body: `$${inv.amount.toFixed(2)} is due today` }); } catch(e){}
            }
          }
        }
      }
  });
    save(KEYS.invoices, list);
    renderReminders();
    renderStats();
  }, 60_000); // every minute
}

// PDF generation
function generateInvoicePdf(inv){
  if(!inv) return;
  // fill template
  const tmp = document.createElement('div');
  tmp.innerHTML = document.querySelector('#invoiceTemplate').innerHTML;
  tmp.querySelector('#pdfTitle').innerText = `Invoice • ${inv.client}`;
  tmp.querySelector('#pdfDate').innerText = `Date: ${formatDate(new Date().toISOString())}`;
  tmp.querySelector('#pdfMeta').innerText = `Invoice #${inv.id.slice(-6).toUpperCase()}`;

  const body = tmp.querySelector('#pdfBody');
  body.innerHTML = `<div><strong>Client:</strong> ${inv.client}</div>
    <div><strong>Due:</strong> ${formatDate(inv.due)}</div>
    <div style="margin-top:12px"><strong>Amount:</strong> $${inv.amount.toFixed(2)}</div>
    <div style="margin-top:8px"><strong>Notes:</strong> ${inv.notes || '—'}</div>`;

  const opt = { margin:10, filename: `${inv.client.replace(/\s+/g,'_')}_${inv.id}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} };
  html2pdf().set(opt).from(tmp).save();
}

// batch PDF
async function downloadAllPdfs(){
  const list = load(KEYS.invoices);
  if(list.length === 0){ alert('No invoices to download'); return; }
  if(!confirm(`Generate ${list.length} PDFs? They will download one by one.`)) return;
  for(const inv of list){
    await new Promise(res => {
      generateInvoicePdf(inv);
      // wait small delay to let browser handle the download prompt
      setTimeout(res, 900);
    });
  }
}

// export / import / reset
function exportAll(){
  const data = { invoices: load(KEYS.invoices), payments: load(KEYS.payments), settings: settingsLoad() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'smartbills_export.json'; a.click(); URL.revokeObjectURL(url);
}

function importFile(e){
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if(!confirm('Import will overwrite local data. Continue?')) return;
      save(KEYS.invoices, data.invoices || []);
      save(KEYS.payments, data.payments || []);
      localStorage.setItem(KEYS.settings, JSON.stringify(data.settings||{}));
      renderAll();
      alert('Imported');
    } catch(err){ alert('Invalid file'); }
  };
  reader.readAsText(f);
}

function resetAll(){
  if(!confirm('Reset will remove all local data. Continue?')) return;
  localStorage.removeItem(KEYS.invoices);
  localStorage.removeItem(KEYS.payments);
  localStorage.removeItem(KEYS.settings);
  renderAll();
  alert('Reset done');
}

function exportPayments(){
  const list = load(KEYS.payments);
  const blob = new Blob([JSON.stringify(list, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'smartbills_cards.json'; a.click(); URL.revokeObjectURL(url);
}

// helpers
function formatDate(d){ return new Date(d).toLocaleDateString(); }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

// small features
function markPaidAuto(id){
  // convenience: mark as paid without UI if needed
  markPaid(id);
}

// startup populate helpers to avoid empty UI
(function seedIfEmpty(){
  if(!localStorage.getItem(KEYS.invoices)) save(KEYS.invoices, []);
  if(!localStorage.getItem(KEYS.payments)) save(KEYS.payments, []);
  if(!localStorage.getItem(KEYS.settings)) settingsSave({ theme: 'light', enableNotifs: false });
})();

// small safety: expose some functions for console debugging
window._smartb = { load, save, KEYS, generateInvoicePdf, renderAll, exportAll };

// request notification permission helper
function toggleNotifications(e){
  const enabled = e.target.checked;
  const s = settingsLoad(); s.enableNotifs = enabled; settingsSave(s);
  if(enabled && "Notification" in window && Notification.permission !== "granted"){
    Notification.requestPermission().then(p => {
      if(p !== 'granted') { alert('Notifications blocked — enable from browser settings to get reminders'); $('#enableNotifs').checked = false; s.enableNotifs=false; settingsSave(s); }
    });
  }
}
