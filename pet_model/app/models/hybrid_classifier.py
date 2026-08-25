import os
import pickle
from typing import Optional, Tuple
import torch
import torch.nn as nn
from ..config import HYBRID_SCALER_PATH, HYBRID_WEIGHTS_PATH

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

# 하이브리드 모델 자산(가중치, 스케일러) 안전 로드 함수 (Joblib & Pickle 이중 로더)
def load_hybrid_assets() -> Tuple[PetHybridClassifier, object, bool]:
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
