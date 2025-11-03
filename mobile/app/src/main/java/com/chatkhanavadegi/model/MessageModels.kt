package com.chatkhanavadegi.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AttachmentDto(
    val id: String,
    val messageId: String,
    val uri: String,
    val mimeType: String,
    val mediaType: String,
    val createdAt: String,
)

@Serializable
data class ReactionDto(
    val id: String,
    val messageId: String,
    val personaId: String,
    val emoji: String,
    val createdAt: String,
)

@Serializable
data class MessageDto(
    val id: String,
    val senderPersonaId: String,
    val originalText: String? = null,
    val originalLocale: String? = null,
    val translatedText: String? = null,
    val translatedLocale: String? = null,
    val toneAdjustedText: String? = null,
    val audioUrl: String? = null,
    val transcriptionText: String? = null,
    val transcriptionConfidence: Double? = null,
    val createdAt: String,
    val messageType: String,
    val media: List<AttachmentDto> = emptyList(),
    val reactions: List<ReactionDto> = emptyList(),
)

@Serializable
data class PagedMessagesResponse(
    val messages: List<MessageDto>,
)

@Serializable
data class SendTextRequest(
    val personaId: String,
    val text: String,
)

@Serializable
data class PersonaActivateRequest(
    val personaId: String,
)

@Serializable
data class ReactionRequest(
    val personaId: String,
    val emoji: String,
)

@Serializable
data class ReactionResponse(
    val reaction: ReactionDto,
)

@Serializable
data class MessageResponse(
    val message: MessageDto,
)
