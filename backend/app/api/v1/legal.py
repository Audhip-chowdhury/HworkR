from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_company_membership_path
from app.database import get_db
from app.models.membership import CompanyMembership
from app.models.user import User
from app.schemas.legal import LegalChatRequest, LegalChatResponse
from app.services import legal_rag_service

router = APIRouter(tags=["legal"])


@router.post(
    "/companies/{company_id}/legal/chat",
    response_model=LegalChatResponse,
)
def legal_chat(
    company_id: str,
    body: LegalChatRequest,
    ctx: Annotated[tuple[User, CompanyMembership], Depends(require_company_membership_path)],
    _db: Annotated[Session, Depends(get_db)],
) -> LegalChatResponse:
    """JWT + active company membership required. RAG uses shared India corpus (not per-tenant DB rows)."""
    _user, _membership = ctx
    _ = _db  # reserved for future per-company legal audit logs
    try:
        return legal_rag_service.legal_chat(message=body.message, region=body.region)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Legal assistant failed. Check Vertex AI and Chroma configuration.",
        ) from e
