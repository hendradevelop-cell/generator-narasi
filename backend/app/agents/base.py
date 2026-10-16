from __future__ import annotations

from typing import Literal

from ..schemas import AgentLog


def log(
    lapisan: str,
    agen: str,
    aksi: str,
    status: Literal["ok", "revisi", "catatan"] = "ok",
    detail: str = "",
) -> AgentLog:
    return AgentLog(lapisan=lapisan, agen=agen, aksi=aksi, status=status, detail=detail)
