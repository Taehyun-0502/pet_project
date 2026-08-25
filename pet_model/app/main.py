from typing import Dict, Any
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import (
    MULTI_MODEL_WEIGHTS_PATH,
    SORTED_MULTI_CLASSES,
    BINARY_MODEL_WEIGHTS_PATH,
    BINARY_CLASS_NAMES,
)
from .schemas import HybridDiagnosisRequest
from .models import safe_load_state_dict, load_hybrid_assets
from .services import run_inference, predict_binary_ensemble, calculate_hybrid_risk

# 1. 이미지 진단 모델 2종 동적 로드
multi_model, is_multi_loaded, MULTI_CLASS_NAMES = safe_load_state_dict(
    MULTI_MODEL_WEIGHTS_PATH, SORTED_MULTI_CLASSES, force_override=False
)
binary_model, is_binary_loaded, BINARY_CLASSES = safe_load_state_dict(
    BINARY_MODEL_WEIGHTS_PATH, BINARY_CLASS_NAMES, force_override=True
)

# 2. 하이브리드 모델 및 스케일러 자산 안전 로드
hybrid_model, numeric_scaler, is_hybrid_loaded = load_hybrid_assets()

# 3. FastAPI 애플리케이션 객체 생성 및 CORS 설정
app = FastAPI(title="Pet Vision & Hybrid AI Dual Inference API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 헬스체크 엔드포인트
@app.get("/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "multi_model_loaded": is_multi_loaded,
        "binary_model_loaded": is_binary_loaded,
        "hybrid_model_loaded": is_hybrid_loaded,
        "multi_classes": MULTI_CLASS_NAMES,
        "binary_classes": BINARY_CLASSES,
        "hybrid_classes": ["NOR", "ABN"]
    }

# 12종 다중 피부 질환 분석 API 엔드포인트
@app.post("/api/v1/predict")
async def predict_multi_skin_disease(file: UploadFile = File(...)) -> Dict[str, Any]:
    return await run_inference(file, multi_model, MULTI_CLASS_NAMES, "Multi-12")

# 정상/피부 질환 가능성 1차 이진 진단 API 엔드포인트
@app.post("/api/v1/predict/binary")
async def predict_binary_skin_disease(file: UploadFile = File(...)) -> Dict[str, Any]:
    return await predict_binary_ensemble(file, binary_model, multi_model)

# 수치(5종) + 자연어(NLP 30종) AI 모델 종합 위험도 점수제 API 엔드포인트
@app.post("/api/v1/predict/hybrid")
async def predict_hybrid_health(req: HybridDiagnosisRequest) -> Dict[str, Any]:
    return calculate_hybrid_risk(req, hybrid_model, numeric_scaler)
