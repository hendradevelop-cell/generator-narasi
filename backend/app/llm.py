from __future__ import annotations

import json
import re

import httpx

from .config import settings


class LLMClient:
    """Klien tipis untuk endpoint OpenAI-compatible. Bila API key kosong, semua panggilan
    mengembalikan None sehingga pipeline otomatis memakai mode mock/offline."""

    def __init__(self) -> None:
        self.available = settings.llm_available()

    async def chat(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
        temperature: float = 0.6,
    ) -> str | None:
        if not self.available:
            return None
        payload: dict = {
            "model": settings.llm_model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{settings.llm_base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception:
            return None

    async def chat_json(self, system: str, user: str, *, temperature: float = 0.4) -> dict | None:
        raw = await self.chat(system, user, json_mode=True, temperature=temperature)
        if not raw:
            return None
        raw = raw.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```[a-zA-Z]*\s*", "", raw)
            raw = re.sub(r"```\s*$", "", raw)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None
