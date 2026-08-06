import os
import io
from typing import List, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms

# 12개 피부 질환 클래스명 환경변수 로드
load_dotenv()

MODEL_WEIGHTS_PATH = os.getenv("MODEL_WEIGHTS_PATH", "weights/dog_skin_model.pt")
CLASS_NAMES_ENV = os.getenv(
    "CLASS_NAMES",
    "class_0,class_1,class_2,class_3,class_4,class_5,class_6,class_7,class_8,class_9,class_10,class_11"
)
CLASS_NAMES = [name.strip() for name in CLASS_NAMES_ENV.split(",")]
NUM_CLASSES = 12

# FastAPI 애플리케이션 객체 생성
app = FastAPI(title="Pet Skin Disease Inference API", version="1.0.0")

# CORS 설정을 통한 프론트엔드/백엔드 통신 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# EfficientNet-B0 기반 12개 클래스 분류 모델 구조 정의 함수
def build_efficientnet_b0(num_classes: int = NUM_CLASSES) -> nn.Module:
    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model

# 글로벌 모델 객체 초기화 및 가중치 파일 로드 함수
def load_trained_model() -> tuple[nn.Module, bool]:
    model = build_efficientnet_b0(NUM_CLASSES)
    is_loaded = False
    
    if os.path.exists(MODEL_WEIGHTS_PATH):
        try:
            state_dict = torch.load(MODEL_WEIGHTS_PATH, map_location=torch.device('cpu'))
            # checkpoint 형태(dict 내 'state_dict' 키 등) 대응
            if isinstance(state_dict, dict) and 'state_dict' in state_dict:
                state_dict = state_dict['state_dict']
            model.load_state_dict(state_dict)
            is_loaded = True
        except Exception as e:
            print(f"[Warning] Failed to load model weights from {MODEL_WEIGHTS_PATH}: {e}")
    else:
        print(f"[Warning] Weights file not found at {MODEL_WEIGHTS_PATH}")
        
    model.eval()
    return model, is_loaded

model, is_weights_loaded = load_trained_model()

# EfficientNet-B0 표준 이미지 전처리 파이프라인 정의
transform_pipeline = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# 서버 상태 및 모델 가중치 파일 로드 여부 확인 헬스체크 엔드포인트
@app.get("/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "weights_loaded": is_weights_loaded,
        "weights_path": MODEL_WEIGHTS_PATH,
        "num_classes": len(CLASS_NAMES)
    }

# 강아지 피부 이미지 수신 및 EfficientNet-B0 추론 결과 반환 API 핸들러
@app.post("/api/v1/predict")
async def predict_skin_disease(file: UploadFile = File(...)) -> Dict[str, Any]:
    # 이미지 파일 형식 검증
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="업로드된 파일이 유효한 이미지 형식이 아닙니다."
        )

    try:
        # 업로드 이미지 파일 읽기 및 PIL Image 변환
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # 입력 이미지 전처리 및 텐서 변환
        input_tensor = transform_pipeline(image).unsqueeze(0)
        
        # 모델 추론 수행 및 Softmax 확률 계산
        with torch.no_grad():
            outputs = model(input_tensor)
            probabilities = F.softmax(outputs, dim=1)[0]
            
        # 12개 클래스별 확률 정렬 및 Top-K 예측 추출
        top_probs, top_indices = torch.topk(probabilities, k=len(CLASS_NAMES))
        
        predictions = []
        for prob, idx in zip(top_probs, top_indices):
            class_idx = idx.item()
            class_name = CLASS_NAMES[class_idx] if class_idx < len(CLASS_NAMES) else f"class_{class_idx}"
            confidence = round(prob.item() * 100, 2)
            predictions.append({
                "class_index": class_idx,
                "class_name": class_name,
                "confidence": confidence
            })
            
        return {
            "success": True,
            "top_prediction": predictions[0],
            "predictions": predictions
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"추론 실행 도중 오류가 발생했습니다: {str(e)}"
        )
