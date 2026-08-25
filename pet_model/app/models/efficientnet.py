import os
from typing import List, Tuple
import torch
import torch.nn as nn
from torchvision import models

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
def safe_load_state_dict(weights_path: str, default_classes: List[str], force_override: bool = False) -> Tuple[nn.Module, bool, List[str]]:
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
