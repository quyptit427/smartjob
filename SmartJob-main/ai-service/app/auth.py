import re

import jwt
from fastapi import HTTPException, Request

from app.settings import settings


def candidate_id(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    token = authorization.removeprefix("Bearer ").strip()
    if not token or not settings.jwt_secret:
        raise HTTPException(status_code=401, detail="Vui lòng đăng nhập.")
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer="smartjob-users",
            audience="smartjob",
            options={"require": ["exp", "sub", "role"]},
        )
    except jwt.PyJWTError as error:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ.") from error
    if payload.get("role") != "CANDIDATE":
        raise HTTPException(status_code=403, detail="Tính năng này dành cho ứng viên.")
    user_id = payload.get("sub", "")
    if not re.fullmatch(r"[a-fA-F0-9]{24}", user_id):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ.")
    return user_id
