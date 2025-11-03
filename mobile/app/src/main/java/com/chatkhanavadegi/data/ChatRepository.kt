package com.chatkhanavadegi.data

import android.content.ContentResolver
import android.net.Uri
import android.util.Log
import com.chatkhanavadegi.model.ChatMessage
import com.chatkhanavadegi.model.MessageDto
import com.chatkhanavadegi.model.MessageResponse
import com.chatkhanavadegi.model.PagedMessagesResponse
import com.chatkhanavadegi.model.Persona
import com.chatkhanavadegi.model.ReactionDto
import com.chatkhanavadegi.model.ReactionRequest
import com.chatkhanavadegi.model.ReactionResponse
import com.chatkhanavadegi.model.SendTextRequest
import com.chatkhanavadegi.model.toDomain
import com.chatkhanavadegi.BuildConfig
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

class ChatRepository {
    private companion object {
        const val TAG = "ChatRepository"
    }
    private val json = Json { ignoreUnknownKeys = true }
    private val client: OkHttpClient = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .build()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var socket: Socket? = null

    private val _incomingMessages = MutableSharedFlow<ChatMessage>(replay = 0, extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val incomingMessages: SharedFlow<ChatMessage> = _incomingMessages

    private val _updatedMessages = MutableSharedFlow<ChatMessage>(replay = 0, extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val updatedMessages: SharedFlow<ChatMessage> = _updatedMessages

    private val _incomingReactions = MutableSharedFlow<ReactionDto>(replay = 0, extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val incomingReactions: SharedFlow<ReactionDto> = _incomingReactions

    suspend fun fetchMessages(limit: Int = 50): List<ChatMessage> = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${BuildConfig.SERVER_BASE_URL}/api/messages?limit=$limit")
            .get()
            .build()

        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@use emptyList()
            val body = response.body?.string() ?: return@use emptyList()
            val parsed = json.decodeFromString<PagedMessagesResponse>(body)
            parsed.messages.map(MessageDto::toDomain)
        }
    }

    suspend fun sendText(persona: Persona, text: String): ChatMessage? = withContext(Dispatchers.IO) {
        runCatching {
            val payload = json.encodeToString(SendTextRequest(persona.id, text))
            val request = Request.Builder()
                .url("${BuildConfig.SERVER_BASE_URL}/api/messages/text")
                .post(payload.toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val body = response.body?.string() ?: return@use null
                val parsed = json.decodeFromString<MessageResponse>(body)
                parsed.message.toDomain()
            }
        }.onFailure { error ->
            Log.e(TAG, "Failed to send text message", error)
        }.getOrNull()
    }

    suspend fun sendReaction(messageId: String, persona: Persona, emoji: String) = withContext(Dispatchers.IO) {
        runCatching {
            val payload = json.encodeToString(ReactionRequest(persona.id, emoji))
            val request = Request.Builder()
                .url("${BuildConfig.SERVER_BASE_URL}/api/messages/$messageId/reactions")
                .post(payload.toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().close()
        }.onFailure { error ->
            Log.e(TAG, "Failed to send reaction", error)
        }
    }

    suspend fun sendVoice(
        persona: Persona,
        audioFile: File,
        mimeType: String = "audio/m4a",
    ): ChatMessage? = withContext(Dispatchers.IO) {
        runCatching {
            val requestBody = MultipartBody.Builder().setType(MultipartBody.FORM)
                .addFormDataPart("personaId", persona.id)
                .addFormDataPart(
                    "audio",
                    audioFile.name,
                    audioFile.asRequestBody(mimeType.toMediaTypeOrNull()),
                )
                .build()
            val request = Request.Builder()
                .url("${BuildConfig.SERVER_BASE_URL}/api/messages/voice")
                .post(requestBody)
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val body = response.body?.string() ?: return@use null
                val parsed = json.decodeFromString<MessageResponse>(body)
                parsed.message.toDomain()
            }
        }.onFailure { error ->
            Log.e(TAG, "Failed to send voice message", error)
        }.getOrNull()
    }

    suspend fun sendMedia(
        persona: Persona,
        files: List<Pair<String, Uri>>,
        caption: String?,
        resolver: ContentResolver,
    ): ChatMessage? = withContext(Dispatchers.IO) {
        if (files.isEmpty()) return@withContext null
        runCatching {
            val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
            builder.addFormDataPart("personaId", persona.id)
            caption?.let { builder.addFormDataPart("caption", it) }
            val tempFiles = mutableListOf<File>()
            try {
                files.forEach { pair ->
                    val (mimeType, uri) = pair
                    val tempFile = createTempFileFromUri(resolver, uri) ?: return@forEach
                    tempFiles += tempFile
                    builder.addFormDataPart(
                        name = "files",
                        filename = tempFile.name,
                        body = tempFile.asRequestBody(mimeType.toMediaTypeOrNull()),
                    )
                }
                val request = Request.Builder()
                    .url("${BuildConfig.SERVER_BASE_URL}/api/messages/media")
                    .post(builder.build())
                    .build()
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) return@use null
                    val body = response.body?.string() ?: return@use null
                    val parsed = json.decodeFromString<MessageResponse>(body)
                    parsed.message.toDomain()
                }
            } finally {
                tempFiles.forEach(File::delete)
            }
        }.onFailure { error ->
            Log.e(TAG, "Failed to send media", error)
        }.getOrNull()
    }

    fun connectSocket(persona: Persona) {
        if (socket?.connected() == true) return
        val opts = IO.Options().apply {
            transports = arrayOf("websocket", "polling")
            reconnection = true
            timeout = 15_000
        }
        socket = IO.socket(BuildConfig.WS_URL, opts)
        socket?.on(Socket.EVENT_CONNECT) {
            scope.launch {
                sendPersonaPresence(persona)
            }
        }
        socket?.on("message:new") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val message = json.decodeFromString<MessageDto>(obj.toString())
            scope.launch { _incomingMessages.emit(message.toDomain()) }
        }
        socket?.on("message:updated") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val message = json.decodeFromString<MessageDto>(obj.toString())
            scope.launch { _updatedMessages.emit(message.toDomain()) }
        }
        socket?.on("reaction:new") { args ->
            val obj = args.firstOrNull() as? JSONObject ?: return@on
            val reaction = json.decodeFromString<ReactionDto>(obj.toString())
            scope.launch { _incomingReactions.emit(reaction) }
        }
        socket?.connect()
    }

    fun disconnectSocket() {
        socket?.disconnect()
        socket = null
    }

    private suspend fun sendPersonaPresence(persona: Persona) {
        val payload = json.encodeToString(mapOf("personaId" to persona.id))
        val request = Request.Builder()
            .url("${BuildConfig.SERVER_BASE_URL}/api/persona/activate")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        runCatching {
            client.newCall(request).execute().close()
        }.onFailure { error ->
            Log.e(TAG, "Failed to send persona presence", error)
        }
    }

    private fun createTempFileFromUri(resolver: ContentResolver, uri: Uri): File? {
        return runCatching {
            val suffix = when (resolver.getType(uri)?.substringAfterLast('/')) {
                "mp4" -> ".mp4"
                "png" -> ".png"
                "jpeg" -> ".jpg"
                "quicktime" -> ".mov"
                "mpeg" -> ".mpg"
                else -> ".dat"
            }
            val inputStream = resolver.openInputStream(uri) ?: return null
            val tempFile = File.createTempFile("upload", suffix)
            inputStream.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            tempFile
        }.onFailure { error ->
            Log.e(TAG, "Failed to copy media from URI: $uri", error)
        }.getOrNull()
    }
}
