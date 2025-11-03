package com.chatkhanavadegi.model

fun MessageDto.toDomain(): ChatMessage {
    val persona = Persona.fromId(senderPersonaId) ?: Persona.Brian
    val attachments = media.map {
        ChatAttachment(
            id = it.id,
            uri = it.uri,
            mimeType = it.mimeType,
            mediaType = when (it.mediaType.lowercase()) {
                "video" -> MediaType.VIDEO
                "audio" -> MediaType.AUDIO
                else -> MediaType.IMAGE
            },
        )
    }
    val reactionsDomain = reactions.mapNotNull { reaction ->
        Persona.fromId(reaction.personaId)?.let { personaReaction ->
            ChatReaction(
                id = reaction.id,
                persona = personaReaction,
                emoji = reaction.emoji,
            )
        }
    }

    val messageType = when (messageType.lowercase()) {
        "voice" -> MessageType.VOICE
        "media" -> MessageType.MEDIA
        else -> MessageType.TEXT
    }

    return ChatMessage(
        id = id,
        sender = persona,
        originalText = originalText,
        translatedText = translatedText,
        toneAdjustedText = toneAdjustedText,
        audioUrl = audioUrl,
        transcriptionText = transcriptionText,
        transcriptionConfidence = transcriptionConfidence,
        createdAt = createdAt,
        type = messageType,
        attachments = attachments,
        reactions = reactionsDomain,
    )
}
