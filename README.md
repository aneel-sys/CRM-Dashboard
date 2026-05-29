# WorkDash — Worksuite CRM Analytics Dashboard

A standalone analytics dashboard that connects to the Worksuite CRM MySQL database in **read-only mode** and displays employee, attendance, project, and timesheet data in real time.

---

## Quick Start (Local Development)

### 1. Configure the database

Edit `workdash/backend/.env`:

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_worksuite_db_name
DB_USER=workdash_readonly
DB_PASS=your_password_here
DB_PREFIX=          ← leave blank or set to e.g. "ws_" if Worksuite uses a prefix
```

### 2. Start the backend

```bash
cd workdash/backend
npm install          # first time only
npm run dev          # starts on http://localhost:5000
```

### 3. Start the frontend

```bash
cd workdash/frontend
npm install          # first time only
npm run dev          # starts on http://localhost:3000
```

Open http://localhost:3000 → login with `admin` / `workdash@2025`

---

## Project Structure

```
workdash/
├── backend/
│   ├── server.js            ← Express app entry point
│   ├── .env                 ← DB + auth credentials (never commit this)
│   ├── .env.example         ← Template for deployment
│   ├── db/
│   │   └── connection.js    ← MySQL connection pool
│   ├── middleware/
│   │   └── auth.js          ← Session auth guard
│   └── routes/
│       ├── auth.js          ← POST /api/auth/login|logout, GET /api/auth/me
│       ├── overview.js      ← GET /api/overview/today
│       ├── attendance.js    ← GET /api/attendance, /export, /departments
│       ├── employees.js     ← GET /api/employees, /api/employees/:id/report
│       ├── projects.js      ← GET /api/projects, /:id, /:id/members, /:id/tasks
│       ├── timings.js       ← GET /api/timings, /export, /filters
│       └── team.js          ← GET /api/team, /export
│
└── frontend/
    ├── src/
    │   ├── App.jsx           ← Router + providers
    │   ├── api/axios.js      ← Axios instance with /api proxy
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   └── ThemeContext.jsx
    │   ├── components/
    │   │   ├── Layout.jsx    ← Shell with auto-refresh every 60s
    │   │   ├── Sidebar.jsx
    │   │   ├── Topbar.jsx
    │   │   ├── StatCard.jsx
    │   │   ├── DataTable.jsx
    │   │   └── Toast.jsx
    │   └── pages/
    │       ├── Login.jsx
    │       ├── Overview.jsx
    │       ├── Attendance.jsx
    │       ├── PersonReport.jsx
    │       ├── Projects.jsx
    │       ├── Timings.jsx
    │       └── Team.jsx
    └── vite.config.js        ← Proxy /api → localhost:5000
```

---

## Production Deployment (Hostinger Cloud Server)

### Step 1 — Upload files

Upload the entire `workdash/` folder to the server (excluding `node_modules/` and `dist/`).

### Step 2 — Install dependencies on server

```bash
cd /path/to/workdash/backend && npm install --production
cd /path/to/workdash/frontend && npm install && npm run build
```

### Step 3 — Configure .env on server

Copy `.env.example` to `.env` and fill in the actual database credentials.
Set `DB_HOST=localhost` (same server as Worksuite).

### Step 4 — Start backend with PM2

```bash
npm install -g pm2
cd /path/to/workdash/backend
pm2 start server.js --name workdash
pm2 save
pm2 startup
```

### Step 5 — Serve frontend with nginx

Option A: Serve built React app on port 80, proxy /api to 5000.

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    root /path/to/workdash/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Option B: Run frontend on a separate port using `serve`:

```bash
npm install -g serve
serve -s /path/to/workdash/frontend/dist -l 3000
```

---

## Database Read-Only Setup

Create a MySQL user with SELECT-only access on the Worksuite database:

```sql
CREATE USER 'workdash_readonly'@'localhost' IDENTIFIED BY 'strong_password_here';
GRANT SELECT ON worksuite_db.* TO 'workdash_readonly'@'localhost';
FLUSH PRIVILEGES;
```

---

## First Run — Verify DB Tables

Before going live, connect to the server and confirm the actual table names:

```sql
USE your_worksuite_db;
SHOW TABLES;
DESCRIBE users;
DESCRIBE attendances;
DESCRIBE project_time_logs;
```

If Worksuite uses a table prefix (e.g. `ws_users`), set `DB_PREFIX=ws_` in `.env`.

---

## Security Notes

- `.env` is in `.gitignore` — never commit database credentials
- All `/api` routes require an active session — 401 returned otherwise
- Only SELECT queries are made — no writes to the Worksuite database, ever
- Change `ADMIN_PASS` and `SESSION_SECRET` before deploying to production
