import os
import io
import traceback
from typing import List, Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models, transforms

# 환경변수 로드
load_dotenv()

# 12종 다중 진단 모델 설정
MULTI_MODEL_WEIGHTS_PATH = os.getenv("MODEL_WEIGHTS_PATH", "weights/dog_skin_model.pt")
MULTI_CLASS_NAMES_ENV = os.getenv(
    "CLASS_NAMES",
    "구진성피부염,태선화,농피증,지루성피부염,탈모증,알러지성피부염,여드름,의증,정상,비만성피부염,결절성피부염,기타"
)
SORTED_MULTI_CLASSES = sorted([name.strip() for name in MULTI_CLASS_NAMES_ENV.split(",")])

# 정상 유무 이진 진단 모델 설정 ("피부 질환 가능성" 명칭 100% 강제 오버라이드)
BINARY_MODEL_WEIGHTS_PATH = os.getenv("BINARY_MODEL_WEIGHTS_PATH", "weights/pet_vision_binary_model.pt")
BINARY_CLASS_NAMES = ["정상", "피부 질환 가능성"]

# 소프트맥스 온도 스케일링 계수
TEMPERATURE = float(os.getenv("TEMPERATURE", "1.0"))

# FastAPI 애플리케이션 객체 생성
app = FastAPI(title="Pet Vision AI Dual Mode Inference API", version="2.0.0")

# CORS 설정을 통한 프론트엔드/백엔드 통신 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# EfficientNet-B0 커스텀 분류 헤드 생성 함수
def build_efficientnet_b0(num_classes: int) -> nn.Module:
    model = models.efficientnet_b0(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(in_features, num_classes)
    return model

# 가중치 텐서 및 분류 헤드 안전 로드 공통 헬퍼 함수 (force_override_classes 옵션 추가)
def safe_load_state_dict(model: nn.Module, weights_path: str, default_classes: List[str], force_override: bool = False) -> tuple[nn.Module, bool, List[str]]:
    active_classes = default_classes
    is_loaded = False
    
    if os.path.exists(weights_path):
        try:
            checkpoint = torch.load(weights_path, map_location=torch.device('cpu'))
            
            if not force_override and isinstance(checkpoint, dict):
                if 'classes' in checkpoint and isinstance(checkpoint['classes'], list):
                    active_classes = checkpoint['classes']
                elif 'class_to_idx' in checkpoint and isinstance(checkpoint['class_to_idx'], dict):
                    idx_map = checkpoint['class_to_idx']
                    active_classes = [k for k, v in sorted(idx_map.items(), key=lambda item: item[1])]
                
                state_dict = checkpoint.get('state_dict', checkpoint.get('model_state_dict', checkpoint.get('model', checkpoint)))
            else:
                state_dict = checkpoint.get('state_dict', checkpoint.get('model_state_dict', checkpoint.get('model', checkpoint))) if isinstance(checkpoint, dict) else checkpoint

            model = build_efficientnet_b0(len(active_classes))
            cleaned_state_dict = {k.replace("module.", ""): v for k, v in state_dict.items()}
            model_state = model.state_dict()
            filtered_state_dict = {k: v for k, v in cleaned_state_dict.items() if k in model_state and model_state[k].shape == v.shape}

            model.load_state_dict(filtered_state_dict, strict=False)
            
            # classifier.1 가중치 직접 이식
            if "classifier.1.weight" in cleaned_state_dict:
                ckpt_weight = cleaned_state_dict["classifier.1.weight"]
                ckpt_bias = cleaned_state_dict.get("classifier.1.bias", None)
                num_ckpt_classes = ckpt_weight.shape[0]
                with torch.no_grad():
                    model.classifier[1].weight.data[:num_ckpt_classes] = ckpt_weight
                    if ckpt_bias is not None:
                        model.classifier[1].bias.data[:num_ckpt_classes] = ckpt_bias

            is_loaded = True
            print(f"[SUCCESS] Loaded {len(active_classes)}-class model weights from {weights_path}")
        except Exception as e:
            print(f"[ERROR] Failed loading {weights_path}: {e}")
            model = build_efficientnet_b0(len(active_classes))
    else:
        print(f"[WARNING] Weights file NOT found: {weights_path}")
        model = build_efficientnet_b0(len(active_classes))

    model.eval()
    return model, is_loaded, active_classes

# 12종 다중 진단 모델 및 이진 진단 모델 각 독립 로드 (이진 모델 라벨 강제 오버라이드)
multi_model, is_multi_loaded, MULTI_CLASS_NAMES = safe_load_state_dict(
    build_efficientnet_b0(len(SORTED_MULTI_CLASSES)), MULTI_MODEL_WEIGHTS_PATH, SORTED_MULTI_CLASSES, force_override=False
)
binary_model, is_binary_loaded, BINARY_CLASSES = safe_load_state_dict(
    build_efficientnet_b0(len(BINARY_CLASS_NAMES)), BINARY_MODEL_WEIGHTS_PATH, BINARY_CLASS_NAMES, force_override=True
)

# EfficientNet-B0 입력 이미지 전처리 파이프라인
transform_pipeline = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# 헬스체크 및 두 모델 준비 상태 반환 엔드포인트
@app.get("/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "multi_model_loaded": is_multi_loaded,
        "binary_model_loaded": is_binary_loaded,
        "multi_classes": MULTI_CLASS_NAMES,
        "binary_classes": BINARY_CLASSES
    }

# 12종 다중 피부 질환 분석 API 엔드포인트
@app.post("/api/v1/predict")
async def predict_multi_skin_disease(file: UploadFile = File(...)) -> Dict[str, Any]:
    return await run_inference(file, multi_model, MULTI_CLASS_NAMES, "Multi-12")

# 정상/피부 질환 가능성 1차 이진 진단 API 엔드포인트
@app.post("/api/v1/predict/binary")
async def predict_binary_skin_disease(file: UploadFile = File(...)) -> Dict[str, Any]:
    return await run_inference(file, binary_model, BINARY_CLASSES, "Binary")

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
