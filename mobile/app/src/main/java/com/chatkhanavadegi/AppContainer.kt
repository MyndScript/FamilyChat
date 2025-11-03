package com.chatkhanavadegi

import android.content.Context
import com.chatkhanavadegi.data.ChatRepository
import com.chatkhanavadegi.data.PersonaStore

class AppContainer(context: Context) {
    val personaStore: PersonaStore = PersonaStore(context.applicationContext)
    val chatRepository: ChatRepository = ChatRepository()
}
