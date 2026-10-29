from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from .config import settings

_bearer = HTTPBearer(auto_error=False)


class Staff(BaseModel):
    id: int
    name: str
    role: str


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def issue_token(staff: Staff) -> str:
    payload = {
        "sub": str(staff.id),
        "name": staff.name,
        "role": staff.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def current_staff(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Staff:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        payload = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, sign in again")
    return Staff(id=int(payload["sub"]), name=payload["name"], role=payload["role"])


def require_admin(staff: Annotated[Staff, Depends(current_staff)]) -> Staff:
    if staff.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")
    return staff


StaffDep = Annotated[Staff, Depends(current_staff)]
AdminDep = Annotated[Staff, Depends(require_admin)]
