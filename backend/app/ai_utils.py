"""Rewrite logic. Phase 3: mock only; real LLM calls go here in a later step."""


def mock_rewrite(text: str, instruction: str) -> str:
    t = text.strip()
    i = instruction.strip() or "(no instruction)"
    return f"[mock] ({i}) {t}"
