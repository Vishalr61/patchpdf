from pydantic import BaseModel, Field


class RewriteRequest(BaseModel):
    text: str = Field(..., description="Original excerpt from the PDF selection")
    instruction: str = Field(..., description="User instruction for how to rewrite it")


class RewriteResponse(BaseModel):
    replacement_text: str = Field(..., description="Proposed replacement text")
