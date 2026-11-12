from fastapi import HTTPException


def problem(status_code: int, code: str, message: str) -> HTTPException:
    """An error the frontend can show as is: {"detail": {"code": ..., "message": ...}}."""
    return HTTPException(status_code, {"code": code, "message": message})
