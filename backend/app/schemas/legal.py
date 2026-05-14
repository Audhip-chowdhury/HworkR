from pydantic import BaseModel, Field


class LegalCitationOut(BaseModel):
    act: str | None = None
    section: str | None = None
    source_doc: str | None = None
    excerpt: str | None = None


class LegalChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    region: str | None = None


class LegalChatResponse(BaseModel):
    answer: str
    citations: list[LegalCitationOut] = Field(default_factory=list)
    region: str
