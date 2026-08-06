package com.pet.backend.chat;

import com.pet.backend.place.Place;
import java.util.List;

public record ChatResponse(String message, List<Place> places) {}
