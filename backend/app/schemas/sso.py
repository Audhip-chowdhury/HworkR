from typing import Any

from pydantic import BaseModel, Field


class SsoProviderInfo(BaseModel):
    id: str
    name: str
    status: str = Field(description="stub | not_configured | active")


class OidcAuthorizeStubResponse(BaseModel):
    message: str
    authorization_url_template: str
    required_env: list[str]


class SamlAcsStubRequest(BaseModel):
    SAMLResponse: str | None = None
    RelayState: str | None = None


class SamlAcsStubResponse(BaseModel):
    status: str
    detail: str
    received_keys: list[str]
