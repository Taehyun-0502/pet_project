from pydantic import BaseModel

# 하이브리드 진단 요청 Pydantic 스키마
class HybridDiagnosisRequest(BaseModel):
    age: float
    weight: float
    crp: float
    igg: float
    il6: float
    text_prompt: str
