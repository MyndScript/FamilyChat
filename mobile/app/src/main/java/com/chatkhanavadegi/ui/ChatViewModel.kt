package com.chatkhanavadegi.ui

import android.content.ContentResolver
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chatkhanavadegi.data.ChatRepository
import com.chatkhanavadegi.data.PersonaStore
import com.chatkhanavadegi.model.ChatMessage
import com.chatkhanavadegi.model.Persona
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface UiEvent {
    data class PlayAudio(val spokenText: String, val locale: String, val audioUrl: String?) : UiEvent
    data class ShowError(val message: String) : UiEvent
}

data class ChatUiState(
    val persona: Persona? = null,
    val isLoading: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val isRecording: Boolean = false,
    val recordingError: String? = null,
)

class ChatViewModel(
    private val personaStore: PersonaStore,
    private val repository: ChatRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState(isLoading = true))
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<UiEvent>()
    val events: MutableSharedFlow<UiEvent> = _events

    init {
        observePersona()
        observeSocket()
    }

    private fun observePersona() {
        viewModelScope.launch {
            personaStore.personaFlow.collect { persona ->
                _uiState.update { it.copy(persona = persona) }
                if (persona != null) {
                    loadMessages()
                    repository.connectSocket(persona)
                } else {
                    repository.disconnectSocket()
                }
            }
        }
    }

    private fun observeSocket() {
        viewModelScope.launch {
            repository.incomingMessages.collect { message ->
                _uiState.update { state ->
                    state.copy(messages = state.messages.upsert(message))
                }
                val persona = uiState.value.persona
                if (persona == Persona.Khadija && message.sender == Persona.Brian) {
                    val spokenText = message.toneAdjustedText ?: message.translatedText
                    if (!spokenText.isNullOrBlank()) {
                        _events.emit(UiEvent.PlayAudio(spokenText, "fa", message.audioUrl))
                    }
                }
            }
        }
        viewModelScope.launch {
            repository.updatedMessages.collect { message ->
                _uiState.update { state ->
                    state.copy(messages = state.messages.upsert(message))
                }
                val persona = uiState.value.persona
                if (persona == Persona.Khadija && message.sender == Persona.Brian) {
                    val spokenText = message.toneAdjustedText ?: message.translatedText
                    if (!spokenText.isNullOrBlank()) {
                        _events.emit(UiEvent.PlayAudio(spokenText, "fa", message.audioUrl))
                    }
                }
            }
        }
        viewModelScope.launch {
            repository.incomingReactions.collect { reaction ->
                _uiState.update { state ->
                    val updated = state.messages.map { message ->
                        if (message.id == reaction.messageId) {
                            val persona = Persona.fromId(reaction.personaId) ?: return@map message
                            if (message.reactions.any { it.id == reaction.id }) return@map message
                            val reactions = message.reactions + com.chatkhanavadegi.model.ChatReaction(
                                id = reaction.id,
                                persona = persona,
                                emoji = reaction.emoji,
                            )
                            message.copy(reactions = reactions)
                        } else message
                    }
                    state.copy(messages = updated)
                }
            }
        }
    }

    private fun loadMessages() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val messages = runCatching { repository.fetchMessages() }.getOrElse { emptyList() }
            _uiState.update { it.copy(isLoading = false, messages = messages.sortedBy { it.createdAt }) }
        }
    }

    fun selectPersona(persona: Persona) {
        viewModelScope.launch {
            personaStore.savePersona(persona)
        }
    }

    fun sendTextMessage(text: String) {
        val persona = uiState.value.persona ?: return
        viewModelScope.launch {
            val message = repository.sendText(persona, text)
            message?.let { msg ->
                _uiState.update { state ->
                    state.copy(messages = state.messages.upsert(msg))
                }
            }
        }
    }

    fun sendReaction(messageId: String, emoji: String) {
        val persona = uiState.value.persona ?: return
        viewModelScope.launch {
            repository.sendReaction(messageId, persona, emoji)
        }
    }

    fun sendVoiceMessage(file: java.io.File, mimeType: String) {
        val persona = uiState.value.persona ?: return
        viewModelScope.launch {
            val message = repository.sendVoice(persona, file, mimeType)
            message?.let { msg ->
                _uiState.update { state ->
                    state.copy(messages = (state.messages + msg).sortedBy { it.createdAt })
                }
            }
        }
    }

    fun sendMedia(resolver: ContentResolver, items: List<Pair<String, Uri>>, caption: String?) {
        val persona = uiState.value.persona ?: return
        viewModelScope.launch {
            val message = repository.sendMedia(persona, items, caption, resolver)
            message?.let { msg ->
                _uiState.update { state ->
                    state.copy(messages = state.messages.upsert(msg))
                }
            }
        }
    }
}

private fun List<ChatMessage>.upsert(message: ChatMessage): List<ChatMessage> {
    return (filterNot { it.id == message.id } + message).sortedBy { it.createdAt }
}
