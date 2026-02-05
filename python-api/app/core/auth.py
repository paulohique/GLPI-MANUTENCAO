from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings


def _require_auth_enabled() -> None:
    if not settings.AUTH_ENABLED:
        raise HTTPException(status_code=503, detail="Auth desabilitada no servidor")


def _jwt_now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(payload: Dict[str, Any]) -> str:
    _require_auth_enabled()

    now = _jwt_now()
    exp = now + timedelta(minutes=int(settings.JWT_EXPIRES_MINUTES))

    to_encode = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }

    secret = settings.JWT_SECRET
    if not secret or secret == "change-me":
        raise HTTPException(status_code=500, detail="JWT_SECRET não configurado")

    return jwt.encode(to_encode, secret, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    _require_auth_enabled()
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")


security = HTTPBearer(auto_error=False)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Dict[str, Any]:
    _require_auth_enabled()

    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Não autenticado")

    payload = decode_access_token(creds.credentials)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Token inválido")

    return payload


def _normalize_group_dns(member_of: Any) -> List[str]:
    if not member_of:
        return []
    if isinstance(member_of, str):
        return [member_of]
    if isinstance(member_of, (list, tuple)):
        return [str(x) for x in member_of]
    return [str(member_of)]


def ldap_authenticate(username: str, password: str) -> Dict[str, Any]:
    """Autentica no AD via bind.

    - NÃO grava nada no LDAP/AD.
    - Retorna dados básicos do usuário e grupos (DNs) se base_dn estiver configurado.
    """

    _require_auth_enabled()

    if not settings.LDAP_SERVER:
        raise HTTPException(status_code=503, detail="LDAP_SERVER não configurado")

    from ldap3 import ALL, Connection, Server

    bind_user = username.strip()
    if "\\" not in bind_user and "@" not in bind_user and settings.LDAP_DOMAIN:
        bind_user = f"{bind_user}@{settings.LDAP_DOMAIN}"

    server = Server(
        settings.LDAP_SERVER,
        get_info=ALL,
        use_ssl=bool(settings.LDAP_USE_SSL),
        connect_timeout=int(settings.LDAP_CONNECT_TIMEOUT_SECONDS),
    )

    try:
        conn = Connection(server, user=bind_user, password=password, auto_bind=True)
    except Exception:
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")

    user_info: Dict[str, Any] = {
        "username": username.strip(),
        "display_name": None,
        "email": None,
        "groups": [],
    }

    base_dn = (settings.LDAP_BASE_DN or "").strip()
    sam = username.split("\\")[-1].split("@")[0]
    if base_dn:
        try:
            from ldap3.utils.conv import escape_filter_chars

            safe_sam = escape_filter_chars(sam)
            conn.search(
                search_base=base_dn,
                search_filter=f"(&(objectClass=user)(sAMAccountName={safe_sam}))",
                attributes=["displayName", "mail", "memberOf"],
            )
            if conn.entries:
                entry = conn.entries[0]
                user_info["display_name"] = str(getattr(entry, "displayName", "") or "") or None
                user_info["email"] = str(getattr(entry, "mail", "") or "") or None
                user_info["groups"] = _normalize_group_dns(getattr(entry, "memberOf", None))
        except Exception:
            pass

    try:
        conn.unbind()
    except Exception:
        pass

    return user_info
