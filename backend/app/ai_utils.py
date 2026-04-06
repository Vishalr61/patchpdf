"""Rewrite logic: OpenAI when configured, else mock."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import httpx

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_TIMEOUT = float(os.getenv("OPENAI_TIMEOUT", "60"))


def mock_rewrite(text: str, instruction: str) -> str:
    t = text.strip()
    i = instruction.strip() or "(no instruction)"
    return f"[mock] ({i}) {t}"


def _extract_chat_content(data: dict[str, Any]) -> str:
    try:
        choices = data["choices"]
        msg = choices[0]["message"]
        content = msg.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(str(block.get("text", "")))
            return "".join(parts).strip()
    except (KeyError, IndexError, TypeError):
        pass
    raise ValueError("unexpected OpenAI response shape")


def llm_rewrite(
    text: str,
    instruction: str,
    *,
    previous_replacement: str | None = None,
) -> str:
    """Call OpenAI Chat Completions; return replacement text only."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    sys_prompt = (
        "You rewrite short excerpts for a PDF editor. Output only the replacement "
        "text — no quotes, no markdown fences, no explanation. Preserve meaning "
        "unless the user asks otherwise. Match approximate length when reasonable."
    )
    user_parts = [
        f"Original excerpt:\n{text.strip()}",
        f"Instruction:\n{instruction.strip() or '(no instruction)'}",
    ]
    if previous_replacement and previous_replacement.strip():
        user_parts.append(
            "Previous draft (revise or replace per instruction):\n"
            f"{previous_replacement.strip()}"
        )
    user_content = "\n\n".join(user_parts)

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.4,
        "max_tokens": 2048,
    }

    url = f"{OPENAI_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=OPENAI_TIMEOUT) as client:
        r = client.post(url, headers=headers, json=payload)

    if r.status_code != 200:
        try:
            err = r.json()
            detail = err.get("error", {})
            msg = detail.get("message", r.text[:500])
        except json.JSONDecodeError:
            msg = r.text[:500]
        raise RuntimeError(f"OpenAI error {r.status_code}: {msg}")

    content = _extract_chat_content(r.json())
    # Strip accidental fences
    content = re.sub(r"^```[a-z]*\s*", "", content, flags=re.IGNORECASE)
    content = re.sub(r"\s*```$", "", content)
    return content.strip() or text.strip()


def rewrite(
    text: str,
    instruction: str,
    *,
    previous_replacement: str | None = None,
) -> str:
    """Use OpenAI when ``OPENAI_API_KEY`` is set; otherwise mock."""
    if OPENAI_API_KEY:
        return llm_rewrite(text, instruction, previous_replacement=previous_replacement)
    return mock_rewrite(text, instruction)


def llm_plan_edits(document_text: str, instruction: str) -> list[dict[str, Any]]:
    """Ask the model for a JSON list of {page, find, replace} edits."""
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not set")

    sys_prompt = (
        "You propose precise text edits for a PDF. Respond with JSON only, no markdown. "
        'Schema: {"edits":[{"page":1,"find":"exact verbatim substring from the document",'
        '"replace":"replacement text"}]}. '
        "Rules: `find` must copy text exactly as it appears (including spaces). "
        "Use one edit per logical change. Page numbers are 1-based. "
        "If nothing to change, return {\"edits\":[]}."
    )
    user_content = (
        f"User instruction:\n{instruction.strip()}\n\n"
        f"Document text by page (use only for find strings):\n{document_text}"
    )

    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.2,
        "max_tokens": 4096,
        "response_format": {"type": "json_object"},
    }

    url = f"{OPENAI_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=OPENAI_TIMEOUT) as client:
        r = client.post(url, headers=headers, json=payload)

    if r.status_code != 200:
        try:
            err = r.json()
            detail = err.get("error", {})
            msg = detail.get("message", r.text[:500])
        except json.JSONDecodeError:
            msg = r.text[:500]
        raise RuntimeError(f"OpenAI error {r.status_code}: {msg}")

    raw = _extract_chat_content(r.json())
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        obj = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE))

    edits = obj.get("edits")
    if not isinstance(edits, list):
        return []
    out: list[dict[str, Any]] = []
    for item in edits:
        if not isinstance(item, dict):
            continue
        try:
            page = int(item["page"])
            find = str(item["find"])
            replace = str(item["replace"])
        except (KeyError, ValueError, TypeError):
            continue
        if not find.strip():
            continue
        out.append({"page": page, "find": find, "replace": replace})
    return out


def mock_plan_edits(document_text: str, instruction: str) -> list[dict[str, Any]]:
    """Deterministic empty plan when no API key."""
    return []


def plan_edits(document_text: str, instruction: str) -> list[dict[str, Any]]:
    if OPENAI_API_KEY:
        return llm_plan_edits(document_text, instruction)
    return mock_plan_edits(document_text, instruction)