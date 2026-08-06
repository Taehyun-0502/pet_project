package com.pet.backend.aisearch;

import com.pet.backend.place.Place;
import java.util.List;

public record AiSearchResponse(String message, List<Place> places) {}
