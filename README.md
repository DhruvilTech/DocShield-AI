# DocShield AI 🛡️

DocShield AI is an enterprise-grade document security and fraud screening platform designed to detect fraudulent, forged, altered, or suspicious identity and travel documents, intercept prompt injections, and maintain a digital forensic audit trail.

---

## 📂 Project Structure

```text
DocShield/
├── backend/                  # Node.js + Express + MySQL Backend (No ORM, Pure SQL)
│   ├── src/
│   │   ├── config/           # Environment validation (Zod), security & RBAC constants
│   │   ├── controllers/      # Thin HTTP controllers (Auth, Users, Roles, Audit, Health)
│   │   ├── database/         # Direct MySQL pool, transactions, migrations & seed runners
│   │   │   └── migrations/   # Deterministic versioned SQL schema migrations (001-008)
│   │   ├── errors/           # Centralized AppError and operational error handlers
│   │   ├── middleware/       # JWT requireAuth, RBAC requirePermission, rateLimiters
│   │   ├── repositories/     # Data access layer with parameterized SQL prepared statements
│   │   ├── routes/           # Versioned REST endpoints (/api/v1/...)
│   │   ├── services/         # Core business logic (Auth, Users, Roles, Audit, Email)
│   │   ├── utils/            # JWT signing, Crypto/Bcrypt, structured Logger, API response
│   │   ├── validators/       # Strict request validation schemas (Zod)
│   │   ├── app.js            # Express application setup (Helmet, CORS, CookieParser)
│   │   └── server.js         # Server bootstrap with graceful shutdown
│   ├── tests/                # Automated Node test runner suites (Auth, RBAC, Health)
│   ├── .env.example          # Environment variables template
│   └── package.json          # Backend dependencies & scripts (Node.js ES Modules)
│
├── frontend/                 # React 19 + TypeScript + Vite + Tailwind CSS + Three.js
│   ├── src/
│   │   ├── components/       # UI widgets, 3D Hero scanners, Auth & Permission guards
│   │   ├── context/          # Centralized AuthContext & SceneContext
│   │   ├── hooks/            # useAuth, useTheme, useReducedMotion
│   │   ├── lib/api/          # API client with auto-refresh interceptors & service modules
│   │   ├── pages/            # Core views, Auth (Login, Register, Reset), Profile & Admin
│   │   └── types/            # TypeScript interfaces for Core & Auth/RBAC domains
│   └── package.json
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (tested on Node.js v24)
- **MySQL**: v8.0+ running locally or remotely (default port `3306`)

---

### 1. Setting up Backend

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy .env configuration
cp .env.example .env
```

Ensure `.env` contains your MySQL credentials:
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=docshield_ai
DB_USER=root
DB_PASSWORD=your_mysql_password
```

#### Run Database Migrations & Seeding
```bash
# Run deterministic migrations
npm run migrate

# Seed RBAC system roles, permissions, and initial accounts
npm run seed
```

#### Seeded Default Accounts:
- **Super Administrator**: `admin@docshield.ai` | `AdminPassword123!` (Role: `super_admin`)
- **Screening Officer**: `officer@docshield.ai` | `OfficerPassword123!` (Role: `screening_officer`)

#### Start Backend Server
```bash
# Development mode with live watch
npm run dev

# Run automated tests
npm test
```
The API will be live at `http://localhost:5000/api/v1` (Health check: `http://localhost:5000/api/v1/health`).

---

### 2. Setting up Frontend

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🔐 Implemented API Endpoints (`/api/v1`)

### Authentication & Sessions
- `POST /api/v1/auth/register` — Register new operator, enforce password policy, assign default role, issue tokens.
- `POST /api/v1/auth/login` — Authenticate credentials, issue access token & rotated refresh token.
- `POST /api/v1/auth/refresh` — Rotate refresh token with reuse detection.
- `POST /api/v1/auth/logout` — Revoke active session and refresh token.
- `POST /api/v1/auth/forgot-password` — Generate expiring single-use reset token.
- `POST /api/v1/auth/reset-password` — Verify token, update password, revoke all active sessions.
- `POST /api/v1/auth/verify-email` — Verify email token.
- `POST /api/v1/auth/resend-verification` — Resend verification link.

### User Management & Profile
- `GET /api/v1/users/me` — Retrieve active authenticated user profile, roles & permissions.
- `PATCH /api/v1/users/me` — Update name/avatar profile details.
- `PATCH /api/v1/users/me/password` — Rotate password with current password verification.
- `GET /api/v1/users` — Admin paginated user search & listing (`requirePermission("users:read")`).
- `GET /api/v1/users/:id` — Admin user details.
- `POST /api/v1/users` — Admin operator creation.
- `PATCH /api/v1/users/:id` — Admin update user details/status.
- `DELETE /api/v1/users/:id` — Admin user deletion.

### Roles & Permissions (RBAC)
- `GET /api/v1/roles` — List system roles and associated permissions.
- `GET /api/v1/roles/permissions` — List all granular permissions.
- `PATCH /api/v1/roles/users/:id/roles` — Assign roles to an operator.

### Investigation Audit Trail
- `GET /api/v1/audit-logs` — Query digital investigation audit logs with action/actor/date filtering (`requirePermission("audit_logs:read")`).

### Health & Telemetry
- `GET /api/v1/health` — Check server status, database latency, and system uptime.

---

## 🛡️ Security Mechanisms
1. **Direct MySQL Parameterization**: 100% prepared statements and parameterized queries (strictly no ORM, no SQL injection).
2. **Dual-Token Authentication**: Short-lived JWT access tokens + rotating refresh tokens with session family tracking and token-reuse attack invalidation.
3. **Password Security**: Modern Bcrypt hashing (12 salt rounds) with complexity enforcement.
4. **Granular RBAC**: Independent permission model (`resource:action`) with backend middleware validation.
5. **Rate Limiting**: Tiered rate limits (`authLimiter` for brute-force sensitive endpoints, `apiLimiter` for general endpoints).
6. **Digital Audit Trail**: Async logging of security, authentication, and administrative actions without exposing secrets.

