const API = 'http://localhost:3000';

// Custom select dropdown for screen recording visibility
function initCustomSelects(){
  document.querySelectorAll('select').forEach(select => {
    if(select.parentElement.classList.contains('custom-select')) return; // already wrapped
    // Skip the schedule type selector - keep it as native
    if(select.id === 'scheduleType') return;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    trigger.textContent = select.options[select.selectedIndex].text;
    wrapper.appendChild(trigger);
    
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'custom-select-options';
    wrapper.appendChild(optionsDiv);
    
    function updateOptions(){
      optionsDiv.innerHTML = '';
      Array.from(select.options).forEach((opt, idx) => {
        const optDiv = document.createElement('div');
        optDiv.className = 'custom-select-option';
        if(idx === select.selectedIndex) optDiv.classList.add('selected');
        optDiv.textContent = opt.text;
        optDiv.dataset.value = opt.value;
        optDiv.addEventListener('click', ()=>{
          select.selectedIndex = idx;
          select.dispatchEvent(new Event('change', {bubbles:true}));
          trigger.textContent = opt.text;
          wrapper.classList.remove('open');
          updateOptions();
        });
        optionsDiv.appendChild(optDiv);
      });
    }
    updateOptions();
    
    trigger.addEventListener('click', (e)=>{
      e.stopPropagation();
      document.querySelectorAll('.custom-select.open').forEach(s => s.classList.remove('open'));
      wrapper.classList.toggle('open');
    });
    
    // close on outside click
    document.addEventListener('click', ()=> wrapper.classList.remove('open'));
    
    // sync if select changes externally
    const observer = new MutationObserver(()=>{
      trigger.textContent = select.options[select.selectedIndex].text;
      updateOptions();
    });
    observer.observe(select, {childList:true, subtree:true});
    select.addEventListener('change', ()=>{
      trigger.textContent = select.options[select.selectedIndex].text;
      updateOptions();
    });
  });
}

// In-page UI helpers: confirm modal and toast messages
function showToast(message, type='info'){
  try{
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div'); t.className = 'toast ' + (type === 'error' ? 'error' : (type === 'success' ? 'success' : ''));
    t.textContent = message;
    container.appendChild(t);
    setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=> t.remove(), 400); }, 3500);
  }catch(e){ console.log('toast failed', e); }
}

function showConfirm(message){
  return new Promise(resolve => {
    const modal = document.getElementById('confirmModal');
    const msg = modal.querySelector('.confirm-message');
    const yes = modal.querySelector('.confirm-yes');
    const no = modal.querySelector('.confirm-no');
    msg.textContent = message;
    modal.style.display = 'flex';
    function cleanup(answer){
      modal.style.display = 'none';
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      resolve(answer);
    }
    function onYes(){ cleanup(true); }
    function onNo(){ cleanup(false); }
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
  });
}

let activeListId = 'default';

async function fetchLists(){
  try{
    const res = await fetch(API + '/lists');
    return res.json();
  }catch(e){ console.error('Failed to fetch lists', e); return []; }
}

async function fetchTasks(){
  try{
    const url = API + '/tasks' + (activeListId ? ('?listId=' + encodeURIComponent(activeListId)) : '');
    const res = await fetch(url);
    return res.json();
  }catch(e){
    console.error('Failed to fetch tasks', e);
    return [];
  }
}

function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function formatDate(iso){
  try{ return new Date(iso).toLocaleString(); }catch(e){ return iso }
}

function describeSchedule(s){
  if(!s) return 'one-time';
  if(s.type === 'once') return `once at ${formatDate(s.time)}`;
  if(s.type === 'daily') return `daily at ${s.time}`;
  if(s.type === 'weekly') return `weekly at ${s.time} on ${Array.isArray(s.weekdays) ? s.weekdays.join(',') : 'any'}`;
  if(s.type === 'interval') return `every ${s.intervalSeconds ? Math.round(s.intervalSeconds/60) : '?'} minutes`;
  if(s.type === 'cron') return `cron: ${s.cron}`;
  return JSON.stringify(s);
}

function createTaskElement(t, index){
  const li = document.createElement('li');
  li.className = 'task-card';
  li.style.animationDelay = (index * 40) + 'ms';

  const executed = t.executedAt ? ` • executed ${formatDate(t.executedAt)}` : '';
  const schedDesc = describeSchedule(t.schedule || (t.time ? {type:'once', time:t.time} : null));

  li.innerHTML = `
    <div class="task-top">
      <div>
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="meta">${formatDate(t.time || t.createdAt)} • <span class="chip">${t.status}</span>${executed}</div>
        <div class="meta" style="margin-top:6px;font-size:12px;color:var(--muted)">${escapeHtml(schedDesc)}</div>
      </div>
      <div style="text-align:right;display:flex;gap:8px;align-items:center">
        <button data-id="${t.id}" data-action="complete" title="Complete" style="background:transparent;border:0;color:var(--muted);cursor:pointer">✔</button>
        <button data-id="${t.id}" data-action="delete" title="Delete" style="background:transparent;border:0;color:var(--muted);cursor:pointer">✕</button>
      </div>
    </div>
    <div class="notes">${escapeHtml(t.notes || '')}</div>
  `;

  // mark completed styling
  if(t.status === 'done' || t.executedAt){
    li.classList.add('completed');
  }

  return li;
}

async function render(tasks){
  const ul = document.getElementById('tasks');
  ul.innerHTML = '';
  if(!tasks || tasks.length === 0){
    const empty = document.createElement('div'); empty.className='empty'; empty.textContent = 'No tasks yet — schedule one!';
    ul.appendChild(empty); return;
  }

  tasks.sort((a,b)=> new Date(a.time || a.createdAt) - new Date(b.time || b.createdAt));
  tasks.forEach((t,i)=> ul.appendChild(createTaskElement(t,i)));
}

// Notification helpers: request permission and show a notification (with toast fallback)
const NOTIFY_BEFORE_MS = 5 * 60 * 1000; // notify 5 minutes before
const _notifiedSet = new Set(); // keys: `${taskId}:${timestamp}` to avoid duplicates

async function requestNotificationPermission(){
  try{
    if(!('Notification' in window)){
      showToast('Browser notifications are not supported in this browser', 'error');
      return false;
    }
    if(Notification.permission === 'granted') return true;
    if(Notification.permission === 'denied'){
      showToast('Notifications are blocked in your browser. Enable them to get reminders.', 'error');
      return false;
    }
    const p = await Notification.requestPermission();
    return p === 'granted';
  }catch(e){ console.error('notification permission failed', e); return false; }
}

function showTaskNotification(task, when){
  const title = `Upcoming: ${task.title}`;
  const timeText = when ? new Date(when).toLocaleTimeString() : '';
  const body = `Due at ${timeText}${task.notes ? ' — ' + task.notes : ''}`;
  try{
    if('Notification' in window && Notification.permission === 'granted'){
      const notif = new Notification(title, { body, tag: `task-${task.id}-${when}`, renotify: false });
      // optional click handler to focus the page
      notif.onclick = () => { try{ window.focus(); }catch(e){} };
    }
  }catch(e){ console.error('show notification error', e); }
  // always show an in-page toast as fallback/extra UX
  showToast(`${title} — ${timeText}`, 'info');
}

function computeNextOccurrence(task){
  const now = new Date();
  const s = task.schedule || null;
  try{
    if(s && s.type === 'once'){
      const t = task.time || s.time; if(!t) return null; const d = new Date(t); if(isNaN(d)) return null; return d;
    }
    if(task.time && !s){ const d = new Date(task.time); if(!isNaN(d)) return d; }
    if(s && s.type === 'daily'){
      // s.time is like "HH:MM"
      const [hh,mm] = (s.time || '').split(':').map(Number);
      if(isNaN(hh)) return null;
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm||0, 0);
      if(d <= now) d.setDate(d.getDate() + 1);
      return d;
    }
    if(s && s.type === 'weekly'){
      // s.weekdays = [0..6], s.time = "HH:MM"
      const days = Array.isArray(s.weekdays) && s.weekdays.length ? s.weekdays : [0,1,2,3,4,5,6];
      const [hh,mm] = (s.time || '').split(':').map(Number);
      const today = now.getDay();
      // find the next day in days including today if time not passed
      for(let offset=0; offset<14; offset++){
        const candDay = (today + offset) % 7;
        if(days.includes(candDay)){
          const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hh||0, mm||0, 0);
          if(candidate > now) return candidate;
        }
      }
      return null;
    }
    if(s && s.type === 'interval'){
      const seconds = Number(s.intervalSeconds || s.interval || 0);
      if(!(seconds > 0)) return null;
      // if task.executedAt present, next = executedAt + interval
      if(task.executedAt){ const d = new Date(task.executedAt); d.setSeconds(d.getSeconds() + seconds); if(d > now) return d; }
      // otherwise, use createdAt or time as a base, step forward until > now (cap iterations)
      let base = task.createdAt ? new Date(task.createdAt) : (task.time ? new Date(task.time) : null);
      if(!base || isNaN(base)) base = new Date();
      const maxSteps = 1000; let steps = 0;
      while(steps++ < maxSteps){ base = new Date(base.getTime() + seconds * 1000); if(base > now) return base; }
      return null;
    }
    // cron or unknown: skip computing on client
    return null;
  }catch(e){ console.error('computeNextOccurrence failed', e); return null; }
}

// Go through tasks and show notifications for any upcoming occurrence within NOTIFY_BEFORE_MS
function scheduleUpcomingNotifications(tasks){
  try{
    if(!tasks || !tasks.length) return;
    const now = Date.now();
    for(const t of tasks){
      const next = computeNextOccurrence(t);
      if(!next) continue;
      const key = `${t.id}:${next.getTime()}`;
      const delta = next.getTime() - now;
      if(delta > 0 && delta <= NOTIFY_BEFORE_MS){
        if(!_notifiedSet.has(key)){
          _notifiedSet.add(key);
          showTaskNotification(t, next.getTime());
        }
      } else if(delta <= 0){
        // if we're past the occurrence, make sure we don't keep the stale key forever
        _notifiedSet.delete(key);
      }
    }
  }catch(e){ console.error('scheduleUpcomingNotifications failed', e); }
}

let __isRefreshing = false;
async function refresh(){
  if(__isRefreshing) return; // avoid overlapping fetches
  __isRefreshing = true;
  try{
    const tasks = await fetchTasks();
    render(tasks);
    // schedule notifications for upcoming tasks (client-side check)
    scheduleUpcomingNotifications(tasks);
  }catch(e){ console.error('refresh failed', e); }
  finally{ __isRefreshing = false; }
}

// Ensure delete button state matches current selection
function updateDeleteButtonState(){
  const delBtn = document.getElementById('delListBtn');
  if(!delBtn) return;
  const cannotDelete = !activeListId || activeListId === 'default';
  delBtn.disabled = !!cannotDelete;
  delBtn.title = cannotDelete ? 'Cannot delete default list' : 'Delete list';
  delBtn.style.opacity = cannotDelete ? '0.6' : '';
  delBtn.style.cursor = cannotDelete ? 'default' : 'pointer';
}

// soft-delete helpers (store hidden list IDs locally)
function _getSoftDeleted(){
  try{ return JSON.parse(localStorage.getItem('ts.softDeleted') || '[]'); }catch(e){ return []; }
}
function _addSoftDeleted(id){
  if(!id) return;
  const arr = _getSoftDeleted();
  if(!arr.includes(id)){ arr.push(id); localStorage.setItem('ts.softDeleted', JSON.stringify(arr)); }
}
function _removeSoftDeleted(id){
  if(!id) return;
  const arr = _getSoftDeleted().filter(x=>x!==id);
  localStorage.setItem('ts.softDeleted', JSON.stringify(arr));
}

// load and render lists into selector
async function loadLists(){
  let lists = await fetchLists();
  const soft = _getSoftDeleted();
  // filter out soft-deleted ids so they stay hidden in the UI
  lists = (lists || []).filter(l => !soft.includes(l.id));
  const sel = document.getElementById('listSelect');
  // ensure there's always a default list visible
  if(!lists.find(l => l.id === 'default')){
    lists.unshift({ id: 'default', name: 'General', createdAt: null });
  }
  sel.innerHTML = '';
  for(const l of lists){
    const opt = document.createElement('option'); opt.value = l.id; opt.textContent = l.name; sel.appendChild(opt);
  }
  // choose active or fallback to default
  if(!lists.find(x=>x.id === activeListId)) activeListId = lists[0] ? lists[0].id : 'default';
  try{ sel.value = activeListId; }catch(e){}
  updateDeleteButtonState();
}

document.getElementById('listSelect').addEventListener('change', (e)=>{ activeListId = e.target.value; updateDeleteButtonState(); refresh(); });
// new list: show inline editor instead of prompt
const newListBtn = document.getElementById('newListBtn');
const newListInline = document.getElementById('newListInline');
const newListInput = document.getElementById('newListInput');
const newListSaveBtn = document.getElementById('newListSaveBtn');
const newListCancelBtn = document.getElementById('newListCancelBtn');

newListBtn.addEventListener('click', ()=>{
  const showing = newListInline.style.display === 'none' ? true : (newListInline.style.display !== 'none' ? false : true);
  // toggle: if we're going to show the inline editor, hide the button
  if(showing){
    newListInline.style.display = 'flex';
    newListBtn.style.display = 'none';
    newListInput.value = '';
    newListInput.focus();
  } else {
    newListInline.style.display = 'none';
    newListBtn.style.display = '';
  }
});

newListCancelBtn.addEventListener('click', ()=>{ newListInline.style.display = 'none'; newListBtn.style.display = ''; });

async function createListFromInline(){
  const name = (newListInput.value || '').trim();
  if(!name){ showToast('List name cannot be empty', 'error'); return; }
  newListSaveBtn.disabled = true; newListSaveBtn.textContent = 'Saving...';
  try{
    const res = await fetch(API + '/lists', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
    if(!res.ok){ const body = await res.text().catch(()=>'<no body>'); console.error('create list failed', res.status, body); showToast('Failed to create list: ' + res.status + '\n' + body, 'error'); return; }
    const created = await res.json();
    activeListId = created.id;
    await loadLists();
    await refresh();
    newListInline.style.display = 'none';
    newListBtn.style.display = '';
    setTimeout(()=>{ const sel = document.getElementById('listSelect'); sel.value = activeListId; }, 40);
  }catch(err){ console.error('create list failed', err); alert('Failed to create list: ' + (err && err.message)); }
  finally{ newListSaveBtn.disabled = false; newListSaveBtn.textContent = 'Save'; }
}

newListSaveBtn.addEventListener('click', createListFromInline);
newListInput.addEventListener('keyup', (e)=>{ if(e.key === 'Enter') createListFromInline(); if(e.key === 'Escape'){ newListInline.style.display = 'none'; newListBtn.style.display = ''; } });

// removed newTaskBtn — creating tasks is done via the form directly

 
document.getElementById('delListBtn').addEventListener('click', async ()=>{
  const delBtn = document.getElementById('delListBtn');
  if(!activeListId) return;
  if(activeListId === 'default'){ showToast('Cannot delete default list', 'error'); return; }
  const ok = await showConfirm('Delete this list and all its tasks?');
  if(!ok) return;

  // optimistic/offline-first removal: remove from UI immediately and remember locally
  const sel = document.getElementById('listSelect');
  const opt = sel.querySelector(`option[value="${activeListId}"]`);
  if(opt) opt.remove();
  // persist the soft-delete so the list stays hidden across reloads when backend is unreachable
  _addSoftDeleted(activeListId);

  // choose a safe active list (prefer 'default', otherwise first option)
  const hasDefault = !!sel.querySelector('option[value="default"]');
  if(hasDefault) activeListId = 'default';
  else if(sel.options.length) activeListId = sel.options[0].value;
  else activeListId = 'default';
  try{ sel.value = activeListId; }catch(e){}
  updateDeleteButtonState();
  refresh();

  // attempt to delete on server; if it fails we keep the soft-delete locally
  delBtn.disabled = true;
  const prevText = delBtn.textContent;
  delBtn.textContent = 'Deleting...';
  try{
    const res = await fetch(API + '/lists/' + encodeURIComponent(opt ? opt.value : activeListId), { method:'DELETE' });
    if(!res.ok){
      const txt = await res.text().catch(()=>'<no body>');
      console.error('delete list failed', res.status, txt);
      showToast('Failed to delete list on server: ' + res.status + '\n' + txt + '\nThe list remains hidden locally.', 'error');
      // keep soft-delete; reload lists filtered by soft-deletes
      await loadLists();
      return;
    }

    // server deleted successfully — remove from soft-deleted set so future fetches won't hide it
    _removeSoftDeleted(opt ? opt.value : activeListId);
    // reload lists from server to ensure UI matches server state
    await loadLists();
    refresh();
  }catch(err){
    console.error('delete list failed', err);
    showToast('Could not contact server. The list was removed locally and will remain hidden until server confirms deletion.', 'error');
  }finally{
    delBtn.disabled = false; delBtn.textContent = prevText;
  }
});

// submit: post and give quick feedback
// show/hide schedule controls
const scheduleTypeSel = document.getElementById('scheduleType');
const controls = document.querySelectorAll('#scheduleControls [data-for]');
function updateControls(){
  const v = scheduleTypeSel.value;
  controls.forEach(c=> c.style.display = c.getAttribute('data-for') === v ? '' : 'none');
}
scheduleTypeSel.addEventListener('change', updateControls);
updateControls();

// initialize Flatpickr for the one-time date input so display is dd/mm/yyyy
if(window.flatpickr){
  window.onceDatePicker = flatpickr("input[name='onceDate']", {
    dateFormat: 'Y-m-d', // value format (ISO) so form submission can parse
    altInput: true,
    altFormat: 'd/m/Y', // displayed format
    allowInput: true
  });
}

document.getElementById('taskForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const title = fd.get('title');
  const notes = fd.get('notes');
  const scheduleType = fd.get('scheduleType');
  if(!title) return;

  const payload = { title, notes };
  payload.listId = activeListId;

  if(scheduleType === 'once'){
    const date = fd.get('onceDate');
    const t = fd.get('onceTime');
    if(!date || !t){
      showToast('Please pick a date and time for a one-time task', 'error');
      return;
    }
    payload.time = new Date(date + 'T' + t).toISOString();
    payload.schedule = { type: 'once', time: payload.time };
  } else if(scheduleType === 'daily'){
    const t = fd.get('dailyTime');
    if(!t){
      showToast('Please select a time for the daily schedule', 'error');
      return;
    }
    payload.schedule = { type: 'daily', time: t };
  }

  const btn = form.querySelector('button');
  btn.disabled = true; btn.textContent = 'Scheduling...';
  try{
    await fetch(API + '/tasks', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    form.reset();
    updateControls();
    await refresh();
  }catch(err){
    console.error(err);
    showToast('Failed to schedule task', 'error');
  }finally{ btn.disabled = false; btn.textContent = 'Schedule Task'; }
});

// handle task actions: complete (tick) and delete (cross)
document.getElementById('tasks').addEventListener('click', async (e)=>{
  const btn = e.target.closest('button[data-id]');
  if(!btn) return;
  const id = btn.dataset.id;
  if(!id) return;
  const action = btn.dataset.action || 'delete';

  if(action === 'complete'){
    // optimistic UI: mark completed locally
    const li = btn.closest('.task-card');
    if(li){
      li.classList.add('completed');
      // update chip text if present
      const chip = li.querySelector('.chip'); if(chip) chip.textContent = 'done';
    }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = '✔';
    try{
      const res = await fetch(API + '/tasks/' + encodeURIComponent(id) + '/complete', { method: 'POST' });
      if(!res.ok){
        const txt = await res.text().catch(()=>'<no body>');
        console.error('complete failed', res.status, txt);
        showToast('Failed to mark task complete: ' + res.status + '\n' + txt, 'error');
        // revert UI
        if(li){ li.classList.remove('completed'); const chip2 = li.querySelector('.chip'); if(chip2) chip2.textContent = 'scheduled'; }
        await refresh();
      } else {
        // success — update UI with server response
        const updated = await res.json().catch(()=>null);
        if(updated && li){ const meta = li.querySelector('.meta'); if(meta) meta.textContent = (updated.executedAt ? 'executed ' + new Date(updated.executedAt).toLocaleString() : meta.textContent); }
      }
    }catch(err){
      console.error('complete failed', err);
      showToast('Failed to mark task complete (network): ' + (err && err.message), 'error');
      if(li) li.classList.remove('completed');
      await refresh();
    }finally{
      btn.disabled = false; try{ btn.textContent = prevText; }catch(e){}
    }

    return;
  }

  // default: delete action
  // provide immediate feedback and prevent double clicks
  btn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = 'Deleting...';

  const li = btn.closest('.task-card');
  if(li){
    li.classList.add('removing');
    // wait for animation to finish (gentle UX)
    await new Promise(r => setTimeout(r, 260));
  }

  try{
    const res = await fetch(API + '/tasks/' + encodeURIComponent(id), { method:'DELETE' });
    if(!res.ok){
      const txt = await res.text().catch(()=>'<no body>');
      console.error('delete failed', res.status, txt);
      showToast('Failed to delete task: ' + res.status + '\n' + txt, 'error');
      // re-render to restore the item if deletion failed
      await refresh();
      return;
    }
  }catch(err){
    console.error('delete failed', err);
    showToast('Failed to delete task (network): ' + (err && err.message), 'error');
  }finally{
    btn.disabled = false;
    try{ btn.textContent = prevText; }catch(e){}
  }

  // refresh list after deletion
  await refresh();
});

// initial load + polling
(async function(){
  await loadLists();
  // request permission for notifications (best-effort)
  requestNotificationPermission().then(ok=>{ if(!ok) console.log('notifications not granted'); });
  refresh();
  // initialize custom selects for screen recording
  initCustomSelects();
  // poll less frequently and avoid overlapping requests
  setInterval(refresh, 15000);
  // also run notification scheduler every 60s to catch new tasks
  setInterval(async ()=>{ try{ const tasks = await fetchTasks(); scheduleUpcomingNotifications(tasks); }catch(e){} }, 60 * 1000);
})();

/* --- Simple particle engine for animated background --- */
(function(){
  const canvas = document.getElementById('bgCanvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, DPR = Math.max(1, window.devicePixelRatio || 1);
  function resize(){
    w = Math.max(300, window.innerWidth);
    h = Math.max(300, window.innerHeight);
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resize);
  resize();

  const particles = [];
  const PALETTE = ['rgba(96,165,250,0.12)','rgba(110,231,183,0.10)','rgba(96,165,250,0.08)'];
  const MAX = 60;

  function rand(min,max){ return Math.random() * (max-min) + min }

  function create(){
    if(particles.length >= MAX) return;
    particles.push({
      x: rand(0,w), y: rand(0,h),
      vx: rand(-0.15,0.15), vy: rand(-0.05,0.05),
      size: rand(1,4), life: rand(8,30), age: 0,
      color: PALETTE[Math.floor(Math.random()*PALETTE.length)]
    });
  }

  function step(dt){
    // spawn
    if(Math.random() < 0.6) create();
    // update
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt/1000;
      // wrap around edges for a continuous feel
      if(p.x < -20) p.x = w + 20; if(p.x > w + 20) p.x = -20;
      if(p.y < -20) p.y = h + 20; if(p.y > h + 20) p.y = -20;
      if(p.age > p.life) particles.splice(i,1);
    }
  }

  function render(){
    ctx.clearRect(0,0,w,h);
    // subtle radial gradient overlay
    const g = ctx.createRadialGradient(w*0.5,h*0.4,0,w*0.5,h*0.4,Math.max(w,h)*0.8);
    g.addColorStop(0,'rgba(10,18,40,0.02)'); g.addColorStop(1,'rgba(2,6,23,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

    for(const p of particles){
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  let last = performance.now();
  function frame(now){
    const dt = Math.min(60, now - last);
    last = now; step(dt); render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // lightweight mouse interaction: repel particles
  let mouse = null;
  window.addEventListener('mousemove', (e)=>{ mouse = { x: e.clientX, y: e.clientY }; setTimeout(()=> mouse = null, 120); });
})();
