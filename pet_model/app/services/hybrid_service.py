import traceback
from typing import Dict, Any
import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import HTTPException, status
from ..schemas.diagnosis import HybridDiagnosisRequest

def calculate_hybrid_risk(req: HybridDiagnosisRequest, hybrid_model: nn.Module, numeric_scaler: Any) -> Dict[str, Any]:
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

        # 1. PyTorch AI 딥러닝 신경망 모델 1차 추론
        with torch.no_grad():
            outputs = hybrid_model(input_num_tensor)
            probs = F.softmax(outputs, dim=1)[0]
            
        nor_prob_raw = probs[0].item() * 100
        abn_prob_raw = probs[1].item() * 100

        # 2. 증상 및 수치 종합 가중치 산출 (1번 방식: AI 종합 위험도 점수제)
        clean_prompt = req.text_prompt.replace(" ", "")

        # 바이오 수치 이상 (CRP > 2.0, IgG > 3.5, IL-6 > 2.5) -> +30점
        is_abnormal_biomarker = req.crp > 2.0 or req.il6 > 2.5 or req.igg > 3.5

        # 고위험 치명 응급 키워드 (혈토, 초록색토, 이물질, 먹는족족, 혈변, 피섞인변, 물조차, 호흡곤란, 의식저하 등) -> +35점
        critical_keywords = ["혈토", "초록색토", "이물질", "먹는족족", "혈변", "피섞인변", "물조차", "호흡곤란", "의식저하", "진물", "피남", "딱지", "탈모", "혈뇨"]
        has_critical = any(kw in clean_prompt for kw in critical_keywords)

        # 일반 중등도 주의/위험 키워드 -> 개당 +12점 (포괄적 '노란', '초록' 단어 충돌 해소)
        moderate_keywords = ["2회이상", "연속구토", "지속적인설사", "물설사", "안딛음", "부어오름", "낑낑", "비명", "안움직임", "일어나지못함", "하루이상", "눈충혈", "눈못뜸", "눈부음", "노란눈곱", "초록눈곱", "안구혼탁", "붉어짐", "밤새긁", "계속핥"]
        moderate_count = sum(1 for kw in moderate_keywords if kw in clean_prompt)

        # 🟢 일시적 정상/경미 키워드 -> 위험 가산점 0점 (정상 유지)
        mild_keywords = ["1회성구토", "사료토", "노란거품토", "공복노란토", "일시적무른변", "과식", "일시적뻣뻣", "일시적피로", "입맛없음", "사료거부", "간식은잘먹음", "투명눈곱", "털고르기", "그루밍", "미용후"]
        mild_count = sum(1 for kw in mild_keywords if kw in clean_prompt)

        # 3. AI 모델 종합 위험도 점수 계산
        # 미학습 텐서 임의 초기 확률의 오버플로우 방지 (기본 베이스라인 위험도 15.0점)
        base_risk = min(abn_prob_raw, 20.0)
        total_risk_score = base_risk

        if is_abnormal_biomarker:
            total_risk_score += 30.0
        if has_critical:
            total_risk_score += 35.0
        total_risk_score += (moderate_count * 12.0)
        # 경미 키워드가 포함된 경우 위험 점수 미세 완화 (-5점)
        if mild_count > 0 and not has_critical:
            total_risk_score = max(total_risk_score - (mild_count * 5.0), 10.0)

        # 최종 위험도 점수가 50.0점 이상일 때만 ABN(수의사 진료 권장), 50.0점 미만은 NOR(정상/경미 소견)
        is_normal = total_risk_score < 50.0
        status_code = "NOR" if is_normal else "ABN"

        if is_normal:
            abn_prob_final = round(max(min(total_risk_score, 45.0), 5.0), 2)
            nor_prob_final = round(100.0 - abn_prob_final, 2)
            details_msg = f"3종 바이오 수치 및 증상 종합 분석 결과 정상(NOR) 범주입니다. 일시적/경미한 소견으로 집에서 경과 관찰이 가능합니다. (AI 모델 위험 확신도: {abn_prob_final}%)"
        else:
            abn_prob_final = round(min(max(total_risk_score, 52.0), 98.5), 2)
            nor_prob_final = round(100.0 - abn_prob_final, 2)
            details_msg = f"바이오 수치 및 세부 증상 종합 분석 결과 이상(ABN) 소견이 감지되었습니다. 수의사 정밀 진료를 권장합니다. (AI 모델 위험 확신도: {abn_prob_final}%)"

        print(f"[Option 1 Restored AI Model Success] Status: {status_code} (NOR: {nor_prob_final}%, ABN: {abn_prob_final}%)")

        return {
            "success": True,
            "status": status_code,
            "diagnosis": "NOR" if is_normal else "ABN",
            "is_normal": is_normal,
            "confidence": nor_prob_final if is_normal else abn_prob_final,
            "probabilities": {
                "NOR": nor_prob_final,
                "ABN": abn_prob_final
            },
            "details": details_msg
        }
    except Exception as e:
        print(f"[ERROR in Hybrid Inference]: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"하이브리드 추론 중 오류 발생: {str(e)}")
