package com.chatkhanavadegi.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.chatkhanavadegi.data.ChatRepository
import com.chatkhanavadegi.data.PersonaStore

class ChatViewModelFactory(
    private val personaStore: PersonaStore,
    private val chatRepository: ChatRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(ChatViewModel::class.java))
        return ChatViewModel(personaStore, chatRepository) as T
    }
}
