package com.pet.backend.chat;

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
import com.pet.backend.place.Place;
import com.pet.backend.place.PlaceCategory;
import com.pet.backend.place.PlaceService;
import com.pet.backend.prediction.DiseasePrediction;
import com.pet.backend.prediction.DiseasePredictionClient;
import java.util.ArrayList;
import java.util.List;
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
public class ChatService {

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

    private final AnthropicClient client;
    private final String model;
    private final PlaceService placeService;
    private final DiseasePredictionClient diseasePredictionClient;
    private final ObjectMapper objectMapper;

    public ChatService(
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
    }

    public ChatResponse ask(ChatRequest request) {
        List<MessageParam> messages = new ArrayList<>();
        messages.add(MessageParam.builder()
                .role(MessageParam.Role.USER)
                .content(request.message())
                .build());

        List<Place> collectedPlaces = new ArrayList<>();
        String finalText = "";

        for (int iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            MessageCreateParams params = MessageCreateParams.builder()
                    .model(model)
                    .maxTokens(MAX_TOKENS)
                    .system(SYSTEM_PROMPT)
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

        return new ChatResponse(finalText, collectedPlaces);
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
