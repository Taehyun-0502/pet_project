package com.pet.backend.aisearch;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.models.messages.ContentBlockParam;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.MessageParam;
import com.anthropic.models.messages.StopReason;
import com.anthropic.models.messages.TextBlock;
import com.anthropic.models.messages.Tool;
import com.anthropic.models.messages.ToolResultBlockParam;
import com.anthropic.models.messages.ToolUseBlock;
import com.anthropic.models.messages.ToolUseBlockParam;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pet.backend.common.BusinessException;
import com.pet.backend.place.Place;
import com.pet.backend.place.PlaceCategory;
import com.pet.backend.place.PlaceService;
import com.pet.backend.prediction.DiseasePrediction;
import com.pet.backend.prediction.DiseasePredictionClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * AI 챗봇 서비스 — Claude Messages API tool use 루프를 직접(manual loop) 구현한다.
 * 도구 2개(get_disease_prediction, search_places)를 Claude가 필요할 때 호출하도록 노출하고,
 * search_places 호출 결과를 모아 최종 응답의 places[]로 프론트에 전달한다.
 *
 * 모델은 application.properties의 anthropic.model(별칭, 예: claude-sonnet-5)로 주입받는다 —
 * 코드에 모델 ID를 하드코딩하지 않는다.
 */
@Slf4j
@Service
public class AiSearchService {

    private static final long MAX_TOKENS = 1024L;
    private static final int MAX_TOOL_ITERATIONS = 5;

    private static final String SYSTEM_PROMPT = """
            너는 반려견 케어 서비스의 AI 상담 챗봇이다. 보호자의 질문에 한국어로 친절하고 간결하게 답한다.

            사용 가능한 도구:
            - get_disease_prediction: 반려동물의 최근 질병예측(이상 징후) 결과를 조회한다.
              건강 상태·이상 징후·병원 방문 필요 여부를 묻는 질문에는 먼저 이 도구로 근거를 확인한 뒤 답변한다.
            - search_places: 키워드와 좌표로 주변 동물병원/애견카페/애견호텔을 검색한다.
              사용자 메시지에서 위치(지역명, 좌표 등)를 알 수 있을 때만 호출하고,
              위치 정보가 없다면 도구를 호출하지 말고 먼저 위치를 물어봐라.

            질병예측 결과를 근거로 병원 방문이 필요하다고 판단되면 search_places로 근처 동물병원을 함께 추천한다.
            """;

    private static final String LOCATION_PROMPT_TEMPLATE =
            "\n검색 기준 위치(사용자가 현재 보고 있는 지도의 중심): (%s, %s). '근처'/'주변'/'이 지역' 요청 시 이 좌표로 search_places를 호출하라.";

    private final AnthropicClient client;
    private final String model;
    private final PlaceService placeService;
    private final DiseasePredictionClient diseasePredictionClient;
    private final ObjectMapper objectMapper;
    // application.properties의 anthropic.api-key는 ${ANTHROPIC_API_KEY:} 빈 기본값을 둔다 —
    // 필수로 만들면 .env 없이 뜨는 모든 환경에서 전체 애플리케이션 컨텍스트가 기동조차 못 한다
    // (place.KakaoClient와 동일한 이유). 대신 여기서 즉시 경고 로그를 남기고(QA L-9), 실제
    // 호출 시점에는 SDK가 애매한 401을 던지기 전에 원인이 분명한 도메인 예외로 먼저 막는다.
    private final boolean apiKeyConfigured;

    public AiSearchService(
            @Value("${anthropic.api-key}") String apiKey,
            @Value("${anthropic.model}") String model,
            PlaceService placeService,
            DiseasePredictionClient diseasePredictionClient,
            ObjectMapper objectMapper) {
        this.client = AnthropicOkHttpClient.builder().apiKey(apiKey).build();
        this.model = model;
        this.placeService = placeService;
        this.diseasePredictionClient = diseasePredictionClient;
        this.objectMapper = objectMapper;
        this.apiKeyConfigured = apiKey != null && !apiKey.isBlank();
        if (!apiKeyConfigured) {
            log.warn("anthropic.api-key(ANTHROPIC_API_KEY)가 설정되지 않았습니다. "
                    + "AI 검색 API 호출 시 예외가 발생합니다 — .env의 ANTHROPIC_API_KEY를 확인하세요.");
        }
    }

    public AiSearchResponse ask(AiSearchRequest request) {
        if (!apiKeyConfigured) {
            // Claude API에 요청조차 보내지 않고 여기서 즉시 실패시켜, SDK의 401을 일반 500으로
            // 오인하지 않고 "키 미설정"임을 로그에서 바로 알 수 있게 한다(QA L-9).
            throw new BusinessException(AiSearchErrorCode.API_KEY_NOT_CONFIGURED);
        }

        List<MessageParam> messages = new ArrayList<>();
        messages.add(MessageParam.builder()
                .role(MessageParam.Role.USER)
                .content(request.message())
                .build());

        String systemPrompt = buildSystemPrompt(request);
        List<Place> collectedPlaces = new ArrayList<>();
        String finalText = "";

        for (int iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            MessageCreateParams params = MessageCreateParams.builder()
                    .model(model)
                    .maxTokens(MAX_TOKENS)
                    .system(systemPrompt)
                    .addTool(getDiseasePredictionTool())
                    .addTool(searchPlacesTool())
                    .messages(messages)
                    .build();

            Message response = client.messages().create(params);

            finalText = response.content().stream()
                    .flatMap(block -> block.text().stream())
                    .map(TextBlock::text)
                    .collect(Collectors.joining("\n"));

            // 어시스턴트 턴을 그대로 히스토리에 추가 — toParam()이 tool_use 블록까지 보존해준다
            messages.add(response.toParam());

            boolean isToolUse = response.stopReason().isPresent()
                    && response.stopReason().get().equals(StopReason.TOOL_USE);
            if (!isToolUse) {
                break;
            }

            List<ContentBlockParam> toolResults = response.content().stream()
                    .flatMap(block -> block.toolUse().stream())
                    .map(toolUse -> executeTool(toolUse, request.petId(), collectedPlaces))
                    .toList();

            if (toolResults.isEmpty()) {
                break;
            }

            messages.add(MessageParam.builder()
                    .role(MessageParam.Role.USER)
                    .contentOfBlockParams(toolResults)
                    .build());
        }

        return new AiSearchResponse(finalText, collectedPlaces);
    }

    // 좌표가 둘 다 있을 때만 위치 컨텍스트를 주입한다 — 하나만 온 경우는 무시하고 기존 동작
    // (메시지의 지역명 사용, 없으면 위치 되묻기)을 그대로 유지한다. 좌표는 저장하지 않고
    // 이 요청의 시스템 프롬프트를 구성하는 데만 쓰인다.
    private String buildSystemPrompt(AiSearchRequest request) {
        if (request.lat() == null || request.lng() == null) {
            return SYSTEM_PROMPT;
        }
        String location = String.format(Locale.ROOT, LOCATION_PROMPT_TEMPLATE, request.lat(), request.lng());
        return SYSTEM_PROMPT + location;
    }

    private ContentBlockParam executeTool(ToolUseBlock toolUse, Long petId, List<Place> collectedPlaces) {
        try {
            String resultText = switch (toolUse.name()) {
                case "get_disease_prediction" -> executeDiseasePrediction(petId);
                case "search_places" -> executeSearchPlaces(toolUse, collectedPlaces);
                default -> throw new IllegalArgumentException("알 수 없는 도구입니다: " + toolUse.name());
            };
            return ContentBlockParam.ofToolResult(ToolResultBlockParam.builder()
                    .toolUseId(toolUse.id())
                    .content(resultText)
                    .build());
        } catch (Exception e) {
            // 원본 예외 메시지(외부 API 응답 본문 일부 등)는 로그로만 남기고,
            // 모델에 돌려주는 tool_result에는 정형화된 문구만 담는다 — 원문이 그대로
            // 챗봇 답변에 노출되는 것을 막기 위함이다.
            log.warn("챗봇 도구 실행 실패: {}", toolUse.name(), e);
            return ContentBlockParam.ofToolResult(ToolResultBlockParam.builder()
                    .toolUseId(toolUse.id())
                    .content(genericFailureMessage(toolUse.name()))
                    .isError(true)
                    .build());
        }
    }

    private String genericFailureMessage(String toolName) {
        return switch (toolName) {
            case "get_disease_prediction" -> "질병예측 조회에 실패했습니다.";
            case "search_places" -> "장소 검색에 실패했습니다.";
            default -> "도구 실행 중 오류가 발생했습니다.";
        };
    }

    // pet_id는 모델이 도구 입력으로 채워 보내지만, 실제 조회는 요청(petId)에 담긴 값을 신뢰한다 —
    // 모델이 잘못된 반려동물 id를 만들어내더라도 조회 대상이 바뀌지 않도록 하기 위함이다.
    private String executeDiseasePrediction(Long petId) throws Exception {
        DiseasePrediction prediction = diseasePredictionClient.predict(petId);
        return objectMapper.writeValueAsString(prediction);
    }

    private String executeSearchPlaces(ToolUseBlock toolUse, List<Place> collectedPlaces) throws Exception {
        SearchPlacesInput input = toolUse._input().convert(SearchPlacesInput.class);
        if (input == null || input.keyword() == null || input.lat() == null || input.lng() == null) {
            throw new IllegalArgumentException("keyword, lat, lng가 모두 필요합니다.");
        }
        PlaceCategory category = inferCategory(input.keyword());
        List<Place> places = placeService.search(category, input.keyword(), input.lat(), input.lng());
        collectedPlaces.addAll(places);
        return objectMapper.writeValueAsString(places);
    }

    private PlaceCategory inferCategory(String keyword) {
        if (keyword.contains("카페")) {
            return PlaceCategory.CAFE;
        }
        if (keyword.contains("호텔")) {
            return PlaceCategory.HOTEL;
        }
        return PlaceCategory.HOSPITAL;
    }

    private Tool getDiseasePredictionTool() {
        return Tool.builder()
                .name("get_disease_prediction")
                .description("반려동물의 최근 질병예측(이상 징후) 결과를 조회한다. "
                        + "건강 상태나 병원 방문 필요 여부에 대한 질문에 답하기 전 근거로 사용한다.")
                .inputSchema(Tool.InputSchema.builder()
                        .properties(Tool.InputSchema.Properties.builder()
                                .putAdditionalProperty("pet_id",
                                        JsonValue.from(Map.of(
                                                "type", "integer",
                                                "description", "조회할 반려동물의 ID")))
                                .build())
                        .required(List.of("pet_id"))
                        .build())
                .build();
    }

    private Tool searchPlacesTool() {
        return Tool.builder()
                .name("search_places")
                .description("키워드와 좌표를 기반으로 주변 동물병원/애견카페/애견호텔을 카카오 로컬 검색으로 조회한다. "
                        + "사용자 메시지에 위치 정보가 없으면 호출하지 말고 먼저 위치를 물어본다.")
                .inputSchema(Tool.InputSchema.builder()
                        .properties(Tool.InputSchema.Properties.builder()
                                .putAdditionalProperty("keyword", JsonValue.from(Map.of(
                                        "type", "string",
                                        "description", "검색 키워드 (예: '동물병원', '강남 애견카페')")))
                                .putAdditionalProperty("lat", JsonValue.from(Map.of(
                                        "type", "number",
                                        "description", "검색 기준 위도")))
                                .putAdditionalProperty("lng", JsonValue.from(Map.of(
                                        "type", "number",
                                        "description", "검색 기준 경도")))
                                .build())
                        .required(List.of("keyword", "lat", "lng"))
                        .build())
                .build();
    }

    private record SearchPlacesInput(String keyword, Double lat, Double lng) {}
}
