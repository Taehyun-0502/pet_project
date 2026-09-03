import io
import traceback
from typing import Dict, Any, List
from PIL import Image
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
import numpy as np
from fastapi import UploadFile, HTTPException, status
from ..config import TEMPERATURE, SORTED_MULTI_CLASSES

# EfficientNet 입력 이미지 전처리 파이프라인
transform_pipeline = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# 피부 발적/충혈/농포/염증(Erythema/Lesion) 픽셀 컴퓨터 비전 정밀 분석기
def analyze_skin_lesion_erythema(image_pil: Image.Image) -> Dict[str, Any]:
    try:
        img_np = np.array(image_pil.convert("RGB"))
        r = img_np[:, :, 0].astype(float)
        g = img_np[:, :, 1].astype(float)
        b = img_np[:, :, 2].astype(float)
        
        # 붉은 피부 염증/발적/농포 픽셀 지수 (R > G + 15 및 R > B + 15 및 R > 60)
        red_mask = (r > (g + 15)) & (r > (b + 15)) & (r > 60)
        red_ratio = float(np.sum(red_mask)) / float(img_np.shape[0] * img_np.shape[1])
        
        # 짙은 붉은색/충혈 지수 (R > G + 30 및 R > B + 30)
        severe_red_mask = (r > (g + 30)) & (r > (b + 30)) & (r > 70)
        severe_red_ratio = float(np.sum(severe_red_mask)) / float(img_np.shape[0] * img_np.shape[1])

        has_active_lesion = (red_ratio >= 0.035 or severe_red_ratio >= 0.015)
        return {
            "red_ratio": red_ratio,
            "severe_red_ratio": severe_red_ratio,
            "has_active_lesion": has_active_lesion
        }
    except Exception as e:
        print(f"[Erythema Analyzer Exception]: {e}")
        return {"red_ratio": 0.0, "severe_red_ratio": 0.0, "has_active_lesion": True}

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
            temp_val = float(os.getenv("TEMPERATURE", "0.05"))
            scaled_outputs = outputs / temp_val
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

# 이중 앙상블 비전 1차 스크리닝 추론 메서드
async def predict_binary_ensemble(file: UploadFile, binary_model: nn.Module, multi_model: nn.Module) -> Dict[str, Any]:
    try:
        image_bytes = await file.read()
        if not image_bytes or len(image_bytes) == 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="업로드된 이미지 파일이 비어있습니다.")

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        input_tensor = transform_pipeline(image).unsqueeze(0)
        
        temp_val = float(os.getenv("TEMPERATURE", "0.05"))
        with torch.no_grad():
            # 1) 이진 분류 AI 모델 추론
            binary_outputs = binary_model(input_tensor)
            binary_probs = F.softmax(binary_outputs / temp_val, dim=1)[0]
            
            # 2) 12종 다중 진단 AI 모델 추론
            multi_outputs = multi_model(input_tensor)
            multi_probs = F.softmax(multi_outputs / temp_val, dim=1)[0]

        # 이진 모델 확률 계산 (Index 0: 피부 질환 가능성/유증상, Index 1: 정상/무증상)
        p_bin_dis = binary_probs[0].item() if binary_probs.shape[0] > 0 else 0.5
        p_bin_norm = binary_probs[1].item() if binary_probs.shape[0] > 1 else 0.5

        # 12종 모델 확률 계산 (Index 8: '정상', 나머지 11개: 피부 질환)
        normal_idx = SORTED_MULTI_CLASSES.index("정상") if "정상" in SORTED_MULTI_CLASSES else -1
        if normal_idx >= 0 and normal_idx < multi_probs.shape[0]:
            p_multi_norm = multi_probs[normal_idx].item()
            p_multi_dis = 1.0 - p_multi_norm
        else:
            p_multi_norm = 0.5
            p_multi_dis = 0.5

        # 3) 피부 발적/충혈/농포 픽셀 컴퓨터 비전 정밀 검증
        erythema_info = analyze_skin_lesion_erythema(image)
        has_active_lesion = erythema_info["has_active_lesion"]
        red_ratio = erythema_info["red_ratio"]

        # 이중 앙상블 확률 가중 합성 (12종 모델 60% + 이진 모델 40%)
        final_norm_prob = (p_multi_norm * 0.6) + (p_bin_norm * 0.4)
        final_dis_prob = (p_multi_dis * 0.6) + (p_bin_dis * 0.4)

        # 컴퓨터 비전 보정 파이프라인: Active Lesion(붉은 발적/농포/충혈)이 없는 깨끗한 털/피부 이미지
        if not has_active_lesion and final_dis_prob > final_norm_prob:
            final_norm_prob = min(0.995, max(0.88, 1.0 - red_ratio))
            final_dis_prob = round(1.0 - final_norm_prob, 4)
            print(f"[Vision Correction Applied] Clean fur detected (redness: {round(red_ratio*100,2)}%) => Adjusted to Normal ({round(final_norm_prob*100,1)}%)")
        elif has_active_lesion and final_norm_prob > final_dis_prob:
            final_dis_prob = min(0.995, max(0.88, round(0.70 + (red_ratio * 0.5), 4)))
            final_norm_prob = round(1.0 - final_dis_prob, 4)
            print(f"[Vision Correction Applied] Active lesion detected (redness: {round(red_ratio*100,2)}%) => Adjusted to Disease ({round(final_dis_prob*100,1)}%)")

        if final_norm_prob > final_dis_prob:
            norm_conf = round(final_norm_prob * 100, 2)
            dis_conf = round(final_dis_prob * 100, 2)
            predictions = [
                {"class_index": 0, "class_name": "정상", "confidence": norm_conf},
                {"class_index": 1, "class_name": "피부 질환 가능성", "confidence": dis_conf}
            ]
        else:
            dis_conf = round(final_dis_prob * 100, 2)
            norm_conf = round(final_norm_prob * 100, 2)
            predictions = [
                {"class_index": 1, "class_name": "피부 질환 가능성", "confidence": dis_conf},
                {"class_index": 0, "class_name": "정상", "confidence": norm_conf}
            ]

        print(f"[Ensemble Binary Success] MultiNorm: {round(p_multi_norm*100,1)}%, BinNorm: {round(p_bin_norm*100,1)}%, RedRatio: {round(red_ratio*100,2)}% => Top 1: '{predictions[0]['class_name']}' ({predictions[0]['confidence']}%)")
        return {
            "success": True,
            "top_prediction": predictions[0],
            "predictions": predictions
        }
    except Exception as e:
        print(f"[ERROR in Ensemble Binary Inference]: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"1차 이진 진단 중 오류 발생: {str(e)}")
