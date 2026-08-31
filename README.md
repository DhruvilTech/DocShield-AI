<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="100%" />
  <h1>🛡️ DOCSHIELD AI: ENTERPRISE SECURITY SCREENING</h1>
  <p><b>Automated Identity Verification, OCR Extraction & Document Tampering Forensics Engine</b></p>
  
  <!-- Animated Badges -->
  <p>
    <img src="https://img.shields.io/badge/Security-100%25_On--Premise_Local_Enclave-green?style=for-the-badge&logo=auth0&logoColor=white" />
    <img src="https://img.shields.io/badge/Forensics-8_Multi--Signal_Detectors-ff69b4?style=for-the-badge&logo=gitlfs&logoColor=white" />
    <img src="https://img.shields.io/badge/Stack-React_19_+_Node_+_FastAPI-blue?style=for-the-badge&logo=react&logoColor=white" />
    <img src="https://img.shields.io/badge/Storage-Air--Gapped_Local_Storage-orange?style=for-the-badge&logo=server&logoColor=white" />
  </p>
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="100%" />
</div>

## 📂 Project Structure

```text
DocShield-AI/
├── AI/                           # Unified FastAPI AI Microservices & Forensic Engine
│   ├── api/                      # FastAPI Routers (Document Detection, Face, Tampering)
│   ├── document_detection/       # Module 1 & 2: OCR Extraction (PaddleOCR/RapidOCR) & ICAO 9303 Checksums
│   ├── face/                     # Module 4: 1:1 ArcFace Biometrics & Phase 5 Active Liveness
│   ├── image_tampering/          # Module 3: Multi-Signal Forensic Tampering Detection Engine
│   │   ├── forensic/             # ELA, Noise, SIFT Copy-Move, Splicing, Defacement, Text Tampering, PDF Forensics
│   │   ├── fusion/               # Evidence Fusion, Spatial Correlation & Conflict Detection
│   │   ├── schemas/              # Pydantic Schemas validating forensic results
│   │   ├── upload/               # Module-specific test and reference uploads
│   │   └── venv/                 # CPU/GPU-optimized Python Virtual Environment
│   ├── uploads/                  # 🔒 Main Unified Local Uploads Folder (Ignored by Git)
│   ├── tests/                    # Automated pytest test suites (120+ tests)
│   ├── app.py                    # Unified FastAPI Application Entrypoint (:8000)
│   └── requirements.txt          # Python dependencies
│
├── backend/                      # Node.js + Express + MySQL Backend (No ORM, Pure SQL)
│   ├── src/
│   │   ├── config/               # Environment validation (Zod) & RBAC roles
│   │   ├── controllers/          # HTTP controllers (Auth, Documents, Tampering, Screening)
│   │   ├── database/             # Prepared SQL migrations (001-008) & seeds
│   │   ├── middleware/           # JWT, rate limiters, permission validations
│   │   ├── routes/               # API routes (/api/v1/...) & (/api/image-tampering/...)
│   │   ├── services/             # Storage, Tampering Python Bridge, AI Client, Screening Pipeline
│   │   └── storage/              # 🔒 Tenant-isolated Local Document Storage Enclave (Ignored by Git)
│   └── package.json
│
├── frontend/                     # React 19 + TypeScript + Vite + Tailwind CSS + Three.js
│   ├── src/
│   │   ├── components/           # UI components, security HUD & interactive 3D scanner views
│   │   ├── pages/                # Scanner, Vault, Threats, Intelligence, Analysis, Admin
│   │   ├── context/              # Centralized Auth & Scene context provider
│   │   └── lib/api/              # API Client with direct Tampering analysis & token-rotation
│   └── package.json
│
└── README.md                     # Root documentation
```

---

## 🔒 100% On-Premise Local Storage & Privacy

For enterprise data security and compliance, **third-party cloud storage (such as Cloudinary) has been completely eliminated**. All documents, images, and PDFs remain strictly on-premise in encrypted, local hardware-isolated storage enclaves:

1. **Main AI Uploads Directory**: `AI/uploads/` — Unified storage directory for all incoming documents across OCR, Face Verification, and Image Tampering.
2. **Image Tampering Uploads Directory**: `AI/image_tampering/upload/` — Preserved for direct forensic benchmark testing.
3. **Backend Local Enclave Storage**: `backend/storage/<organizationId>/<fileId><ext>` — Tenant-isolated storage with SHA-256 cryptographic verification.
4. **Git Protection**: All upload and storage directories are strictly ignored in `.gitignore` to prevent any personal or test documents from ever being committed to GitHub.

---

## 🛠️ Multi-Signal Forensic Tampering Detection Engine

DocShield AI utilizes a reference-free forensic tampering detection pipeline across **8 independent forensic detectors**:

```mermaid
graph TD
    subgraph Inputs["Document Ingestion"]
        orig["Uploaded Image / Multi-Page PDF"] --> prep["preprocessing.py: Safe Scaling & Color Spaces"]
    end
    
    subgraph Detectors["8 Forensic Detectors (Reference-Free)"]
        prep --> ela["ELA: Error Level Compression Inconsistency"]
        prep --> noise["Noise: Substrate Residual SNR Variance"]
        prep --> cm["Copy-Move: SIFT Keypoints + RANSAC Homography"]
        prep --> splice["Splicing: Boundary Steps & Edge Discontinuities"]
        prep --> deface["Content Defacement: Brush & Overpaint Detection"]
        prep --> text["Text Tampering: Substrate Voids & Glyph Metric Disparities"]
        prep --> stamp["Stamp / Seal: HSV Chrominance & Shape Regularity"]
        prep --> meta["Metadata: Software Tags & EXIF/PDF Integrity"]
    end
    
    subgraph Fusion["Evidence Fusion & Localization"]
        ela & noise & cm & splice & deface & text & stamp & meta --> loc["localization.py: Multi-Signal Spatial Clustering"]
        loc --> score["score_fusion.py: Weighted Belief & Risk Level"]
        score --> exp["explanation_engine.py: Human-Readable Forensic Narrative"]
    end
    
    subgraph Output["Output Response Schema"]
        score & loc & exp --> json["ForensicResult (JSON): Status, Score, Risk, Regions, Pages"]
    end
```

---

## 🚀 Quick Start Guide

### 1. Start the Python AI Engine

In PowerShell / terminal, navigate to `AI/` and start the FastAPI service using the project virtual environment:

```powershell
cd "D:\MSU hackathon\DocShield-AI\AI"

# Activate the venv and start FastAPI uvicorn
.\image_tampering\venv\Scripts\Activate.ps1
uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

- **Swagger API Documentation**: `http://127.0.0.1:8000/docs`
- **Health Check**: `http://127.0.0.1:8000/health`
- **Ready Probe**: `http://127.0.0.1:8000/ready`

---

### 2. Start the Node.js Backend

Ensure you have **Node.js v18+** and a **MySQL v8.0+** database:

```bash
cd backend
npm install
npm run migrate
npm run seed
npm run dev
```

- **Backend API**: `http://localhost:5000`
- **Tampering Endpoint**: `POST http://localhost:5000/api/image-tampering/analyze`

#### Seeded Accounts:
- **Super Administrator**: `admin@docshield.ai` | `AdminPassword123!`
- **Screening Officer**: `officer@docshield.ai` | `OfficerPassword123!`

---

### 3. Start the TypeScript React Frontend

```bash
cd frontend
npm install
npm run dev
```

- **Web Application**: `http://localhost:5173`

---

## 🧪 Testing & Verification

### Run Forensic Tampering Test Suite (120+ Tests)
```powershell
cd AI
.\image_tampering\venv\Scripts\python.exe -m pytest tests/ -v
```

### Run Python CLI Bridge Standalone
```powershell
cd AI
.\image_tampering\venv\Scripts\python.exe image_tampering/forensic/cli.py --input image_tampering/upload/p1.png
.\image_tampering\venv\Scripts\python.exe image_tampering/forensic/cli.py --input "image_tampering/upload/Adhaar card of dhruv.pdf"
.\image_tampering\venv\Scripts\python.exe image_tampering/forensic/cli.py --input image_tampering/upload/p5.jpeg
```

---

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="100%" />
  <p><b>DocShield AI © 2026. Automated Document Authenticity & Identity Verification.</b></p>
</div>
