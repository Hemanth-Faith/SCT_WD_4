// Lightweight backend using only Node built-ins to avoid node_modules
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const LISTS_FILE = path.join(DATA_DIR, 'lists.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

function readJson(file){
  try{ return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); }catch(e){ return []; }
}
function writeJson(file, data){
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function sendJSON(res, status, obj){
  const payload = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function sendText(res, status, text){ res.writeHead(status, { 'Content-Type': 'text/plain' }); res.end(text); }

function serveStatic(req, res, pathname){
  // Serve files from frontend directory; default to index.html
  const filePath = pathname === '/' ? path.join(FRONTEND_DIR, 'index.html') : path.join(FRONTEND_DIR, pathname);
  if(!filePath.startsWith(FRONTEND_DIR)) return sendText(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data)=>{
    if(err) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if(req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }

  try{
    // API: /lists
    if(pathname === '/lists'){
      if(req.method === 'GET'){
        const lists = readJson(LISTS_FILE);
        return sendJSON(res, 200, lists);
      }
      if(req.method === 'POST'){
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = body ? JSON.parse(body) : {};
        const name = data.name && String(data.name).trim();
        if(!name) return sendText(res, 400, 'name required');
        const lists = readJson(LISTS_FILE);
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
        const item = { id, name, createdAt: new Date().toISOString() };
        lists.push(item); writeJson(LISTS_FILE, lists);
        return sendJSON(res, 201, item);
      }
    }

    // DELETE /lists/:id
    if(pathname.startsWith('/lists/') && req.method === 'DELETE'){
      const id = pathname.split('/')[2];
      if(!id) return sendText(res, 400, 'id required');
      let lists = readJson(LISTS_FILE); const before = lists.length;
      lists = lists.filter(l => l.id !== id);
      if(lists.length === before) return sendText(res, 404, 'not found');
      writeJson(LISTS_FILE, lists);
      let tasks = readJson(TASKS_FILE); tasks = tasks.filter(t => t.listId !== id); writeJson(TASKS_FILE, tasks);
      res.writeHead(204); return res.end();
    }

    // Tasks endpoints
    if(pathname === '/tasks'){
      if(req.method === 'GET'){
        let tasks = readJson(TASKS_FILE);
        const listId = parsed.query && parsed.query.listId;
        if(listId) tasks = tasks.filter(t => t.listId === listId);
        return sendJSON(res, 200, tasks);
      }
      if(req.method === 'POST'){
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = body ? JSON.parse(body) : {};
        if(!data.title) return sendText(res, 400, 'title required');
        const tasks = readJson(TASKS_FILE);
        const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
        const item = {
          id,
          title: String(data.title),
          notes: data.notes || '',
          listId: data.listId || 'default',
          createdAt: new Date().toISOString(),
          time: data.time || null,
          schedule: data.schedule || null,
          status: 'scheduled'
        };
        tasks.push(item); writeJson(TASKS_FILE, tasks); return sendJSON(res, 201, item);
      }
    }

    // DELETE /tasks/:id
    if(pathname.startsWith('/tasks/') && req.method === 'DELETE'){
      const id = pathname.split('/')[2]; if(!id) return sendText(res, 400, 'id required');
      let tasks = readJson(TASKS_FILE); const before = tasks.length; tasks = tasks.filter(t => t.id !== id);
      if(tasks.length === before) return sendText(res, 404, 'not found'); writeJson(TASKS_FILE, tasks); res.writeHead(204); return res.end();
    }

    // POST /tasks/:id/complete  -> mark a task as executed/done
    if(pathname.startsWith('/tasks/') && pathname.endsWith('/complete') && req.method === 'POST'){
      const parts = pathname.split('/');
      const id = parts[2];
      if(!id) return sendText(res, 400, 'id required');
      let tasks = readJson(TASKS_FILE);
      const idx = tasks.findIndex(t => t.id === id);
      if(idx === -1) return sendText(res, 404, 'not found');
      const now = new Date().toISOString();
      tasks[idx].status = 'done';
      tasks[idx].executedAt = now;
      writeJson(TASKS_FILE, tasks);
      return sendJSON(res, 200, tasks[idx]);
    }

    // Fallback: serve static frontend if available
    if(FRONTEND_DIR && fs.existsSync(FRONTEND_DIR)){
      return serveStatic(req, res, pathname === '/' ? '/' : pathname);
    }

    sendText(res, 404, 'Not found');
  }catch(err){
    console.error('server error', err);
    sendText(res, 500, 'server error');
  }
});

server.listen(PORT, ()=> console.log(`Todo scheduler backend listening on http://localhost:${PORT}`));
