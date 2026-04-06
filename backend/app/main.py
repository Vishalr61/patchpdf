from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai_utils import mock_rewrite
from app.schemas import RewriteRequest, RewriteResponse

app = FastAPI(title="PatchPDF API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    """Avoid 404 when opening the server root in a browser."""
    return {
        "service": "PatchPDF API",
        "docs": "/docs",
        "health": "/health",
        "rewrite": "POST /rewrite — JSON body: text, instruction",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/rewrite", response_model=RewriteResponse)
def rewrite(body: RewriteRequest) -> RewriteResponse:
    replacement = mock_rewrite(body.text, body.instruction)
    return RewriteResponse(replacement_text=replacement)
