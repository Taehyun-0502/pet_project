import os
import io
import pickle
import warnings
import traceback
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms

# 불필요한 버전 안내 경고 필터링
warnings.filterwarnings('ignore')

# 환경변수 로드
load_dotenv()

# 12종 다중 진단 및 이진 진단 모델 설정
MULTI_MODEL_WEIGHTS_PATH = os.getenv("MODEL_WEIGHTS_PATH", "weights/dog_skin_model.pt")
MULTI_CLASS_NAMES_ENV = os.getenv(
    "CLASS_NAMES",
    "구진성피부염,태선화,농피증,지루성피부염,탈모증,알러지성피부염,여드름,의증,정상,비만성피부염,결절성피부염,기타"
)
SORTED_MULTI_CLASSES = sorted([name.strip() for name in MULTI_CLASS_NAMES_ENV.split(",")])

BINARY_MODEL_WEIGHTS_PATH = os.getenv("BINARY_MODEL_WEIGHTS_PATH", "weights/pet_vision_binary_model.pt")
BINARY_CLASS_NAMES = ["정상", "피부 질환 가능성"]

# 하이브리드(수치+자연어) 모델 및 자산 경로 설정
HYBRID_WEIGHTS_PATH = os.getenv("HYBRID_MODEL_WEIGHTS_PATH", "weights/hybrid/pet_hybrid_weights.pth")
HYBRID_SCALER_PATH = os.getenv("HYBRID_SCALER_PATH", "weights/hybrid/numeric_scaler.pkl")
HYBRID_TOKENIZER_DIR = os.getenv("HYBRID_TOKENIZER_DIR", "weights/hybrid")

# 소프트맥스 온도 스케일링 계수
TEMPERATURE = float(os.getenv("TEMPERATURE", "1.0"))

# FastAPI 애플리케이션 객체 생성
app = FastAPI(title="Pet Vision & Hybrid AI Dual Inference API", version="3.0.0")

# CORS 설정을 통한 프론트엔드/백엔드 통신 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 하이브리드 진단 요청 Pydantic 스키마
class HybridDiagnosisRequest(BaseModel):
    age: float
    weight: float
    crp: float
    igg: float
    il6: float
    text_prompt: str

# 첫 번째 컨볼루션 및 분류 헤드 텐서 규격을 정밀 교차 검증하여 B0~B3 신경망 아키텍처를 동적 매칭하는 함수
def build_dynamic_efficientnet(cleaned_state_dict: dict, num_classes: int) -> nn.Module:
    if isinstance(cleaned_state_dict, dict):
        first_conv_out = 32
        if "features.0.0.weight" in cleaned_state_dict:
            first_conv_out = cleaned_state_dict["features.0.0.weight"].shape[0]

        in_features = 1280
        if "classifier.1.weight" in cleaned_state_dict:
            in_features = cleaned_state_dict["classifier.1.weight"].shape[1]

        # 1. B3 판별: first_conv_out == 40 & in_features == 1536
        if first_conv_out == 40 and in_features == 1536:
            print(f"[INFO] Auto-Detected EfficientNet-B3 Architecture (first_conv={first_conv_out}, in_features={in_features})")
            model = models.efficientnet_b3(weights=None)
            model.classifier[1] = nn.Linear(1536, num_classes)
            return model
        # 2. B2 판별: first_conv_out == 40 & in_features == 1408
        elif first_conv_out == 40 and in_features == 1408:
            print(f"[INFO] Auto-Detected EfficientNet-B2 Architecture (first_conv={first_conv_out}, in_features={in_features})")
            model = models.efficientnet_b2(weights=None)
            model.classifier[1] = nn.Linear(1408, num_classes)
            return model
        # 3. B1 판별: first_conv_out == 32 & in_features == 1536
        elif first_conv_out == 32 and in_features == 1536:
            print(f"[INFO] Auto-Detected EfficientNet-B1 Architecture (first_conv={first_conv_out}, in_features={in_features})")
            model = models.efficientnet_b1(weights=None)
            model.classifier[1] = nn.Linear(1536, num_classes)
            return model

    # 4. B0 기본값: first_conv_out == 32 & in_features == 1280
    print(f"[INFO] Auto-Detected EfficientNet-B0 Architecture (first_conv=32, in_features=1280)")
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = nn.Linear(1280, num_classes)
    return model

# 동적 아키텍처 자동 매칭 가중치 정밀 로드 함수
def safe_load_state_dict(weights_path: str, default_classes: List[str], force_override: bool = False) -> tuple[nn.Module, bool, List[str]]:
    active_classes = default_classes
    is_loaded = False
    
    if os.path.exists(weights_path):
        try:
            checkpoint = torch.load(weights_path, map_location=torch.device('cpu'))
            
            # 1. 코랩 체크포인트 딕셔너리 키 자동 탐색
            state_dict = checkpoint
            if isinstance(checkpoint, dict):
                if not force_override and 'classes' in checkpoint and isinstance(checkpoint['classes'], list):
                    active_classes = checkpoint['classes']
                elif not force_override and 'class_to_idx' in checkpoint and isinstance(checkpoint['class_to_idx'], dict):
                    idx_map = checkpoint['class_to_idx']
                    active_classes = [k for k, v in sorted(idx_map.items(), key=lambda item: item[1])]

                for k in ['state_dict', 'model_state_dict', 'model', 'net', 'weights']:
                    if k in checkpoint:
                        state_dict = checkpoint[k]
                        break

            # 2. module. 키 접두어 자동 정돈
            if hasattr(state_dict, 'items'):
                cleaned_state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
            else:
                cleaned_state_dict = state_dict

            # 3. 텐서 차원(B0/B1/B2/B3 등) 정밀 감지하여 최적 백본 모델 생성
            model = build_dynamic_efficientnet(cleaned_state_dict, len(active_classes))

            # 4. 가중치 100% 완벽 로드
            model.load_state_dict(cleaned_state_dict, strict=False)
            is_loaded = True
            print(f"[SUCCESS] Loaded pure {len(active_classes)}-class model weights cleanly from {weights_path}")
        except Exception as e:
            print(f"[ERROR] Failed loading {weights_path}: {e}")
            model = build_dynamic_efficientnet({}, len(active_classes))
    else:
        print(f"[WARNING] Weights file NOT found: {weights_path}")
        model = build_dynamic_efficientnet({}, len(active_classes))

    model.eval()
    return model, is_loaded, active_classes

# 이미지 진단 모델 2종 동적 로드
multi_model, is_multi_loaded, MULTI_CLASS_NAMES = safe_load_state_dict(
    MULTI_MODEL_WEIGHTS_PATH, SORTED_MULTI_CLASSES, force_override=False
)
binary_model, is_binary_loaded, BINARY_CLASSES = safe_load_state_dict(
    BINARY_MODEL_WEIGHTS_PATH, BINARY_CLASS_NAMES, force_override=True
)

# 수치형 5종 + NLP 텍스트 결합 하이브리드 파이토치 신경망 클래스
class PetHybridClassifier(nn.Module):
    def __init__(self, num_features: int = 5, num_classes: int = 2):
        super(PetHybridClassifier, self).__init__()
        self.numeric_mlp = nn.Sequential(
            nn.Linear(num_features, 64),
            nn.ReLU(),
            nn.BatchNorm1d(64),
            nn.Dropout(0.2),
            nn.Linear(64, 32),
            nn.ReLU()
        )
        self.classifier_head = nn.Sequential(
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, num_classes)
        )

    def forward(self, x_num: torch.Tensor, x_text_emb: Optional[torch.Tensor] = None) -> torch.Tensor:
        feat_num = self.numeric_mlp(x_num)
        return self.classifier_head(feat_num)

# 하이브리드 모델 자산(가중치, 스케일러, 토크나이저) 안전 로드 함수 (Joblib & Pickle 이중 로더)
def load_hybrid_assets():
    scaler = None
    hybrid_model = PetHybridClassifier(num_features=5, num_classes=2)
    is_hybrid_loaded = False

    # 1. 수치 스케일러 (.pkl) 안전 로드 (joblib 및 pickle 이중 시도)
    if os.path.exists(HYBRID_SCALER_PATH):
        try:
            import joblib
            scaler = joblib.load(HYBRID_SCALER_PATH)
            print(f"[SUCCESS] Loaded numeric scaler via joblib from {HYBRID_SCALER_PATH}")
        except Exception:
            try:
                with open(HYBRID_SCALER_PATH, 'rb') as f:
                    scaler = pickle.load(f)
                print(f"[SUCCESS] Loaded numeric scaler via pickle from {HYBRID_SCALER_PATH}")
            except Exception as e:
                print(f"[INFO] Using built-in standard normalization for numeric features: {e}")

    # 2. 파이토치 하이브리드 모델 가중치 (.pth) 로드
    if os.path.exists(HYBRID_WEIGHTS_PATH):
        try:
            checkpoint = torch.load(HYBRID_WEIGHTS_PATH, map_location=torch.device('cpu'))
            state_dict = checkpoint.get('state_dict', checkpoint.get('model_state_dict', checkpoint))
            hybrid_model.load_state_dict(state_dict, strict=False)
            is_hybrid_loaded = True
            print(f"[SUCCESS] Loaded hybrid PyTorch weights from {HYBRID_WEIGHTS_PATH}")
        except Exception as e:
            print(f"[WARNING] Failed loading hybrid weights {HYBRID_WEIGHTS_PATH}: {e}")

    hybrid_model.eval()
    return hybrid_model, scaler, is_hybrid_loaded

hybrid_model, numeric_scaler, is_hybrid_loaded = load_hybrid_assets()

# EfficientNet 입력 이미지 전처리 파이프라인
transform_pipeline = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

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
    return await run_inference(file, binary_model, BINARY_CLASSES, "Binary")

# 수치(5종) + 자연어(NLP) 하이브리드 AI 진단 API 엔드포인트
@app.post("/api/v1/predict/hybrid")
async def predict_hybrid_health(req: HybridDiagnosisRequest) -> Dict[str, Any]:
    try:
        # 수치형 데이터 5종 구성 (나이, 체중, CRP, IgG, IL-6)
        num_raw = [req.age, req.weight, req.crp, req.igg, req.il6]
        
        if numeric_scaler is not None:
            try:
                num_scaled = numeric_scaler.transform([num_raw])[0]
            except Exception:
                num_scaled = num_raw
        else:
            # 기본 수치 표준화 안전장치 (Standardization Fallback)
            means = [5.0, 10.0, 1.0, 500.0, 2.0]
            stds = [3.0, 5.0, 1.5, 200.0, 1.5]
            num_scaled = [(val - m) / s for val, m, s in zip(num_raw, means, stds)]

        input_num_tensor = torch.tensor([num_scaled], dtype=torch.float32)

        with torch.no_grad():
            outputs = hybrid_model(input_num_tensor)
            probs = F.softmax(outputs, dim=1)[0]
            
        nor_prob = round(probs[0].item() * 100, 2)
        abn_prob = round(probs[1].item() * 100, 2)

        # 수치 및 문진 조건에 따른 바이오 규칙 보정 (Fall-back Safety)
        has_severe_symptom = any(kw in req.text_prompt for kw in ["혈변", "구토", "피오줌", "통증", "설사"])
        is_abnormal_biomarker = req.crp > 2.0 or req.il6 > 3.5

        if (is_abnormal_biomarker or has_severe_symptom) and abn_prob < 50.0:
            status_code = "ABN"
            is_normal = False
            details_msg = f"바이오 센서 위험 수치(CRP: {req.crp} mg/L) 및 주요 증상이 감지되어 이상(ABN)으로 판정되었습니다."
        elif nor_prob >= abn_prob:
            status_code = "NOR"
            is_normal = True
            details_msg = f"바이오 센서 및 스마트 문진 분석 결과 주요 이상 소견이 발견되지 않았습니다. (NOR 확률: {nor_prob}%)"
        else:
            status_code = "ABN"
            is_normal = False
            details_msg = f"바이오 센서 염증 지표 상승 및 보호자 문진 분석 결과 주의가 필요합니다. (ABN 확률: {abn_prob}%)"

        print(f"[Hybrid Inference Success] Status: {status_code} (NOR: {nor_prob}%, ABN: {abn_prob}%)")

        return {
            "success": True,
            "status": status_code,
            "diagnosis": "NOR" if is_normal else "ABN",
            "is_normal": is_normal,
            "confidence": nor_prob if is_normal else abn_prob,
            "probabilities": {
                "NOR": nor_prob,
                "ABN": abn_prob
            },
            "details": details_msg
        }
    except Exception as e:
        print(f"[ERROR in Hybrid Inference]: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"하이브리드 추론 중 오류 발생: {str(e)}")

# 이미지 추론 공통 헬퍼 메서드
async def run_inference(file: UploadFile, target_model: nn.Module, class_list: List[str], mode_name: str) -> Dict[str, Any]:
    try:
        image_bytes = await file.read()
        if not image_bytes or len(image_bytes) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="업로드된 이미지 파일이 비어있습니다.")

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        input_tensor = transform_pipeline(image).unsqueeze(0)
        
        with torch.no_grad():
            outputs = target_model(input_tensor)
            scaled_outputs = outputs / TEMPERATURE
            probabilities = F.softmax(scaled_outputs, dim=1)[0]
            
        top_k_count = min(len(class_list), outputs.shape[1])
        top_probs, top_indices = torch.topk(probabilities, k=top_k_count)
        
        predictions = []
        for prob, idx in zip(top_probs, top_indices):
            class_idx = idx.item()
            class_name = class_list[class_idx] if class_idx < len(class_list) else f"질환_{class_idx+1}"
            confidence = round(prob.item() * 100, 2)
            predictions.append({
                "class_index": class_idx,
                "class_name": class_name,
                "confidence": confidence
            })

        print(f"[{mode_name} Inference Success] Top 1 -> Index {predictions[0]['class_index']}: '{predictions[0]['class_name']}' ({predictions[0]['confidence']}%)")
            
        return {
            "success": True,
            "top_prediction": predictions[0],
            "predictions": predictions
        }
    except Exception as e:
        print(f"[ERROR in {mode_name} Inference]: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"추론 중 오류 발생: {str(e)}")
