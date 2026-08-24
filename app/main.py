from fastapi import FastAPI

from .detection import analyze_message
from .models import AnalysisResult, MessageInput

app = FastAPI(
    title="AI-SOC Prototype API",
    description="Controlled first slice for transparent email-indicator analysis.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResult)
def analyze(message: MessageInput) -> AnalysisResult:
    return analyze_message(message)

