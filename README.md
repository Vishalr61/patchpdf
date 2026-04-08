## PatchPDF

Human-in-the-loop AI-assisted PDF editor.

### What it does

- **Upload PDFs** and preview pages in the browser (PDF.js)
- **Select text**, write an instruction, and **Rewrite**
- **Accept/Reject** proposals; accepted changes are listed and reorderable
- **Export** a patched PDF in one of two modes:
  - **Reflow (default)**: generates a **brand-new PDF** from extracted text + find→replace edits (stable for long rewrites; lower visual fidelity)
  - **Overlay**: whites out a rectangle and draws replacement text (closer to original look; more finicky for long rewrites)
- Optional **Document plan**: propose edits across all pages and import resolved edits

### Repo layout

- `frontend/` — Vite + React + TypeScript UI
- `backend/` — FastAPI API + PyMuPDF PDF processing

### Prerequisites

- Node.js 18+
- Python 3.12+

### Setup

#### Backend (FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a local env file for secrets:

```bash
cp .env.example .env
# edit .env and set OPENAI_API_KEY=...
```

Run the API:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check: `GET http://127.0.0.1:8000/health`

#### Frontend (Vite)

```bash
cd frontend
npm install
npm run dev
```

By default the UI calls `http://127.0.0.1:8000`. Override with `VITE_API_BASE_URL`.

### Using the app

1. Click **Open PDF** and pick a PDF.
2. Select text in the PDF.
3. Type an instruction (e.g. “simplify this”).
4. Click **Run rewrite** → review output → **Accept**.
5. Add more accepts (optional), reorder/remove accepted changes.
6. Choose **Export mode**:
   - **Reflow** (recommended for long changes / multilingual output)
   - **Overlay** (better when you need to preserve look)
7. Click **Download PDF**.

### Notes / limitations

- PDFs are hard to “edit like Word.” **Overlay** does not reflow surrounding text.
- **Reflow** produces a clean document but does not preserve the original layout (columns, spacing, exact fonts).
- Scanned/image-only PDFs are not fully supported without OCR.

### Development smoke test (backend)

```bash
cd backend
PATCHPDF_MOCK_ONLY=1 .venv/bin/python scripts/smoke_test_capabilities.py
```

This runs `/rewrite`, `/export` (reflow + multi-patch), and `/plan` (mock may be empty).

