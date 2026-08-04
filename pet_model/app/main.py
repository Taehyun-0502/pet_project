from fastapi import FastAPI

app = FastAPI(title="pet-model")


@app.get("/health")
def health():
    return {"status": "ok"}


# 모델 추론 엔드포인트는 여기에 추가한다
# 예:
# @app.post("/predict")
# def predict(data: PredictRequest):
#     ...
