package com.chatkhanavadegi.model

data class ChatMessage(
    val id: String,
    val sender: Persona,
    val originalText: String?,
    val translatedText: String?,
    val toneAdjustedText: String?,
    val audioUrl: String?,
    val transcriptionText: String?,
    val transcriptionConfidence: Double?,
    val createdAt: String,
    val type: MessageType,
    val attachments: List<ChatAttachment>,
    val reactions: List<ChatReaction>,
)

data class ChatAttachment(
    val id: String,
    val uri: String,
    val mimeType: String,
    val mediaType: MediaType,
)

data class ChatReaction(
    val id: String,
    val persona: Persona,
    val emoji: String,
)

enum class MessageType { TEXT, VOICE, MEDIA }

enum class MediaType { IMAGE, VIDEO, AUDIO }
