from pydantic import BaseModel, Field


class MessageInput(BaseModel):
    sender: str
    display_name: str = ""
    reply_to: str | None = None
    subject: str = ""
    body: str = ""
    urls: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    rule_id: str
    title: str
    evidence: str
    weight: int


class AnalysisResult(BaseModel):
    score: int
    severity: str
    findings: list[Finding]
    explanation: str
    recommended_actions: list[str]

