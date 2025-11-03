package com.chatkhanavadegi.util

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

class TtsSpeaker(context: Context) {
    private val speaker: TextToSpeech = TextToSpeech(context) {}

    fun speak(text: String, localeTag: String) {
        val locale = if (localeTag.equals("fa", ignoreCase = true)) Locale("fa", "IR") else Locale.US
        speaker.language = locale
        speaker.speak(text, TextToSpeech.QUEUE_FLUSH, null, "chat-message")
    }

    fun dispose() {
        speaker.stop()
        speaker.shutdown()
    }
}
