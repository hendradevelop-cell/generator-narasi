import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


@dataclass
class Settings:
    llm_api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY", "").strip())
    llm_base_url: str = field(
        default_factory=lambda: os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/")
    )
    llm_model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "gpt-4o-mini").strip())
    words_per_minute: float = field(default_factory=lambda: float(os.getenv("WORDS_PER_MINUTE", "150")))
    dup_threshold: float = field(default_factory=lambda: float(os.getenv("DUP_THRESHOLD", "0.92")))
    data_dir: Path = field(default_factory=lambda: BASE_DIR / "data")

    def llm_available(self) -> bool:
        return bool(self.llm_api_key)

    @property
    def mode(self) -> str:
        return "llm" if self.llm_available() else "mock"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
