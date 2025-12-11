const http = require('http');
const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname);
const LISTS_FILE = path.join(DATA_DIR, 'lists.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

function sendJSON(res, status, obj){
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type'
  });
  res.end(JSON.stringify(obj));
}

async function readJson(file, fallback){
  try{ const txt = await fs.readFile(file, 'utf8'); return JSON.parse(txt || 'null') || fallback; }catch(e){ return fallback; }
}
async function writeJson(file, obj){ await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8'); }

function makeId(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*9000+1000).toString(36); }

async function handleRequest(req, res){
  const url = new URL(req.url, `http://${req.headers.host}`);
  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type'
    });
    return res.end();
  }

  // lists
  if(url.pathname === '/lists' && req.method === 'GET'){
    const lists = await readJson(LISTS_FILE, []);
    return sendJSON(res, 200, lists);
  }
  if(url.pathname === '/lists' && req.method === 'POST'){
    const body = await readBody(req);
    const lists = await readJson(LISTS_FILE, []);
    const item = { id: makeId('list'), name: body.name || ('List ' + (lists.length+1)), createdAt: new Date().toISOString() };
    lists.push(item); await writeJson(LISTS_FILE, lists); return sendJSON(res, 201, item);
  }
  if(url.pathname.startsWith('/lists/') && req.method === 'DELETE'){
    const id = decodeURIComponent(url.pathname.split('/')[2] || '');
    let lists = await readJson(LISTS_FILE, []);
    lists = lists.filter(l=> l.id !== id);
    await writeJson(LISTS_FILE, lists);
    // also remove tasks in that list
    let tasks = await readJson(TASKS_FILE, []);
    tasks = tasks.filter(t=> t.listId !== id);
    await writeJson(TASKS_FILE, tasks);
    return sendJSON(res, 200, { ok:true });
  }

  // tasks
  if(url.pathname === '/tasks' && req.method === 'GET'){
    const tasks = await readJson(TASKS_FILE, []);
    const listId = url.searchParams.get('listId');
    const filtered = listId ? tasks.filter(t=> t.listId === listId) : tasks;
    return sendJSON(res, 200, filtered);
  }
  if(url.pathname === '/tasks' && req.method === 'POST'){
    const body = await readBody(req);
    const tasks = await readJson(TASKS_FILE, []);
    const item = Object.assign({
      id: makeId('task'), title: body.title || 'Untitled', notes: body.notes || '', createdAt: new Date().toISOString(), status: 'scheduled'
    }, body || {});
    tasks.push(item); await writeJson(TASKS_FILE, tasks); return sendJSON(res, 201, item);
  }
  if(url.pathname.startsWith('/tasks/') && req.method === 'DELETE'){
    const id = decodeURIComponent(url.pathname.split('/')[2] || '');
    let tasks = await readJson(TASKS_FILE, []);
    tasks = tasks.filter(t=> t.id !== id);
    await writeJson(TASKS_FILE, tasks);
    return sendJSON(res, 200, { ok:true });
  }
  if(url.pathname.startsWith('/tasks/') && url.pathname.endsWith('/complete') && req.method === 'POST'){
    const id = decodeURIComponent(url.pathname.split('/')[2] || '');
    const tasks = await readJson(TASKS_FILE, []);
    const t = tasks.find(x=> x.id === id);
    if(!t) return sendJSON(res, 404, { error: 'not found' });
    t.status = 'done'; t.executedAt = new Date().toISOString();
    await writeJson(TASKS_FILE, tasks);
    return sendJSON(res, 200, t);
  }

  // fallback: simple 404
  res.writeHead(404, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});
  res.end(JSON.stringify({ error: 'not found' }));
}

function readBody(req){
  return new Promise((resolve,reject)=>{
    let buf = '';
    req.on('data', c=> buf += c.toString());
    req.on('end', ()=>{ try{ resolve(buf ? JSON.parse(buf) : {}); }catch(e){ resolve({}); } });
    req.on('error', reject);
  });
}

// ensure data files exist
async function ensureSeed(){
  try{ await fs.access(LISTS_FILE); }catch(e){ await writeJson(LISTS_FILE, [{ id:'default', name:'General', createdAt: new Date().toISOString() }]); }
  try{ await fs.access(TASKS_FILE); }catch(e){ await writeJson(TASKS_FILE, []); }
}

(async ()=>{
  try{
    await ensureSeed();
    const server = http.createServer(handleRequest);
    const port = process.env.PORT ? Number(process.env.PORT) : 3000;
    const host = '0.0.0.0';
    server.listen(port, host, ()=> console.log('Todo scheduler backend listening on http://' + host + ':' + port));
    
    server.on('error', (err)=> {
      console.error('Server error:', err);
      process.exit(1);
    });
    
    process.on('uncaughtException', (err)=> {
      console.error('Uncaught exception:', err);
    });
    
    process.on('unhandledRejection', (err)=> {
      console.error('Unhandled rejection:', err);
    });
  }catch(err){
    console.error('Startup error:', err);
    process.exit(1);
  }
})();
