import os
import warnings
from dotenv import load_dotenv

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
BINARY_CLASS_NAMES = ["피부 질환 가능성", "정상"]

# 하이브리드(수치+자연어) 모델 및 자산 경로 설정
HYBRID_WEIGHTS_PATH = os.getenv("HYBRID_MODEL_WEIGHTS_PATH", "weights/hybrid/pet_hybrid_weights.pth")
HYBRID_SCALER_PATH = os.getenv("HYBRID_SCALER_PATH", "weights/hybrid/numeric_scaler.pkl")
HYBRID_TOKENIZER_DIR = os.getenv("HYBRID_TOKENIZER_DIR", "weights/hybrid")

# 소프트맥스 온도 스케일링 계수
TEMPERATURE = float(os.getenv("TEMPERATURE", "1.0"))
