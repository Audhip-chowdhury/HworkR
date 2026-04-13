from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.schemas.sso import OidcAuthorizeStubResponse, SamlAcsStubRequest, SamlAcsStubResponse, SsoProviderInfo

router = APIRouter(prefix="/auth/sso", tags=["sso"])


@router.get("/providers", response_model=list[SsoProviderInfo])
def list_sso_providers() -> list[SsoProviderInfo]:
    return [
        SsoProviderInfo(id="google_oidc", name="Google (OIDC)", status="stub"),
        SsoProviderInfo(id="saml2", name="SAML 2.0", status="stub"),
    ]


@router.get("/google/authorize", response_model=OidcAuthorizeStubResponse)
def google_oidc_authorize_stub() -> OidcAuthorizeStubResponse:
    return OidcAuthorizeStubResponse(
        message="OIDC not configured. Wire GOOGLE_CLIENT_ID/SECRET and callback URL to enable.",
        authorization_url_template="https://accounts.google.com/o/oauth2/v2/auth?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code&scope=openid%20email%20profile",
        required_env=["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
    )


@router.post("/saml/acs", response_model=SamlAcsStubResponse)
def saml_acs_stub(body: SamlAcsStubRequest) -> Any:
    keys = [k for k, v in body.model_dump().items() if v]
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content=SamlAcsStubResponse(
            status="not_implemented",
            detail="SAML ACS endpoint is a contract stub. Integrate python3-saml or similar for production.",
            received_keys=keys,
        ).model_dump(),
    )
