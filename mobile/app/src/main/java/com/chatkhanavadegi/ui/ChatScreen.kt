package com.chatkhanavadegi.ui

import android.Manifest
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.chatkhanavadegi.R
import com.chatkhanavadegi.model.ChatAttachment
import com.chatkhanavadegi.model.ChatMessage
import com.chatkhanavadegi.model.MediaType
import com.chatkhanavadegi.model.MessageType
import com.chatkhanavadegi.model.Persona
import com.chatkhanavadegi.util.AudioRecorder
import com.chatkhanavadegi.util.TtsSpeaker
import kotlinx.coroutines.launch

@Composable
fun ChatScreen(viewModel: ChatViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = androidx.compose.ui.platform.LocalContext.current
    val ttsSpeaker = remember { TtsSpeaker(context) }
    val audioRecorder = remember { AudioRecorder(context) }
    var recordingFile by remember { mutableStateOf<java.io.File?>(null) }
    var isRecording by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { permissions ->
        val granted = permissions.values.all { it }
        if (granted) {
            recordingFile = audioRecorder.start()
            isRecording = true
        }
    }

    val mediaPickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris ->
        val persona = state.persona ?: return@rememberLauncherForActivityResult
        if (uris.isNullOrEmpty()) return@rememberLauncherForActivityResult
        val resolver = context.contentResolver
        val files = uris.mapNotNull { uri ->
            val mime = resolver.getType(uri) ?: return@mapNotNull null
            mime to uri
        }
        viewModel.sendMedia(resolver, files, caption = null)
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is UiEvent.PlayAudio -> {
                    if (event.spokenText.isNotBlank()) {
                        ttsSpeaker.speak(event.spokenText, event.locale)
                    }
                }
                is UiEvent.ShowError -> {
                    // TODO: hook into snackbar host
                }
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            ttsSpeaker.dispose()
            audioRecorder.dispose()
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        when (val persona = state.persona) {
            null -> PersonaSelection(
                onSelect = {
                    viewModel.selectPersona(it)
                },
            )
            else -> ChatContent(
                persona = persona,
                state = state,
                onSendText = { text -> viewModel.sendTextMessage(text) },
                onSendReaction = { messageId, emoji -> viewModel.sendReaction(messageId, emoji) },
                onPickMedia = { mediaPickerLauncher.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                onToggleRecord = {
                    if (isRecording) {
                        val file = audioRecorder.stop()
                        recordingFile = null
                        isRecording = false
                        if (file != null) {
                            viewModel.sendVoiceMessage(file, "audio/m4a")
                        }
                    } else {
                        audioPermissionLauncher.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
                    }
                },
                isRecording = isRecording,
            )
        }
    }
}

@Composable
private fun PersonaSelection(onSelect: (Persona) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Chat Khanavadegi",
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = { onSelect(Persona.Khadija) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp)
        ) {
            Text(text = Persona.Khadija.displayName, style = MaterialTheme.typography.titleLarge)
        }
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = { onSelect(Persona.Brian) },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp)
        ) {
            Text(text = Persona.Brian.displayName, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable
private fun ChatContent(
    persona: Persona,
    state: ChatUiState,
    onSendText: (String) -> Unit,
    onSendReaction: (String, String) -> Unit,
    onPickMedia: () -> Unit,
    onToggleRecord: () -> Unit,
    isRecording: Boolean,
) {
    var messageText by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        if (state.isLoading) {
            LinearLoader()
        }
        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 12.dp),
            reverseLayout = false,
        ) {
            items(state.messages, key = { it.id }) { message ->
                MessageBubble(
                    message = message,
                    isMine = message.sender == persona,
                    onReaction = { emoji -> onSendReaction(message.id, emoji) },
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
        if (persona == Persona.Brian) {
            BrianComposer(
                text = messageText,
                onTextChange = { messageText = it },
                onSend = {
                    if (messageText.isNotBlank()) {
                        onSendText(messageText)
                        messageText = ""
                    }
                },
                onPickMedia = onPickMedia,
            )
        } else {
            KhadijaComposer(
                isRecording = isRecording,
                onToggleRecord = onToggleRecord,
            )
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage, isMine: Boolean, onReaction: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isMine) Alignment.End else Alignment.Start,
    ) {
        val bubbleColor = if (isMine) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.primaryContainer
        Column(
            modifier = Modifier
                .background(bubbleColor, RoundedCornerShape(24.dp))
                .padding(16.dp)
                .fillMaxWidth(0.9f)
        ) {
            val primaryText = if (isMine) {
                when {
                    !message.originalText.isNullOrBlank() -> message.originalText
                    !message.translatedText.isNullOrBlank() -> message.translatedText
                    !message.toneAdjustedText.isNullOrBlank() -> message.toneAdjustedText
                    else -> null
                }
            } else {
                when {
                    !message.toneAdjustedText.isNullOrBlank() -> message.toneAdjustedText
                    !message.translatedText.isNullOrBlank() -> message.translatedText
                    !message.originalText.isNullOrBlank() -> message.originalText
                    else -> null
                }
            }
            primaryText?.let { textValue ->
                Text(
                    text = textValue,
                    style = MaterialTheme.typography.bodyLarge,
                    textAlign = if (isMine) TextAlign.End else TextAlign.Start,
                )
            }
            if (message.type == MessageType.VOICE) {
                Spacer(modifier = Modifier.height(8.dp))
                if (!message.transcriptionText.isNullOrBlank()) {
                    Text(
                        text = message.transcriptionText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CircularProgressIndicator(modifier = Modifier.height(16.dp), strokeWidth = 2.dp)
                        Text(
                            text = "Transcribing…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (message.attachments.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                AttachmentRow(attachments = message.attachments)
            }
        }
        ReactionRow(reactions = message.reactions, onAddReaction = onReaction)
    }
}

@Composable
private fun AttachmentRow(attachments: List<ChatAttachment>) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        attachments.forEach { attachment ->
            when (attachment.mediaType) {
                MediaType.IMAGE -> AsyncImage(
                    model = attachment.uri,
                    contentDescription = null,
                    modifier = Modifier
                        .height(120.dp)
                        .fillMaxWidth(0.4f)
                        .background(Color.Black, RoundedCornerShape(16.dp)),
                )
                MediaType.VIDEO -> PlaceholderAttachment(icon = R.drawable.ic_video, label = "Video")
                MediaType.AUDIO -> PlaceholderAttachment(icon = R.drawable.ic_audio, label = "Audio")
            }
        }
    }
}

@Composable
private fun PlaceholderAttachment(icon: Int, label: String) {
    Column(
        modifier = Modifier
            .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Image(painter = painterResource(id = icon), contentDescription = label)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = label)
    }
}

@Composable
private fun ReactionRow(reactions: List<com.chatkhanavadegi.model.ChatReaction>, onAddReaction: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        reactions.forEach { reaction ->
            Text(text = "${reaction.emoji} ${reaction.persona.displayName}", style = MaterialTheme.typography.bodySmall)
        }
        FilledTonalIconButton(onClick = { onAddReaction("❤️") }) {
            Icon(imageVector = Icons.Default.Favorite, contentDescription = "Love")
        }
    }
}

@Composable
private fun BrianComposer(text: String, onTextChange: (String) -> Unit, onSend: () -> Unit, onPickMedia: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FloatingActionButton(onClick = onPickMedia, shape = CircleShape) {
            Icon(imageVector = Icons.Default.Add, contentDescription = "Add media")
        }
        androidx.compose.material3.OutlinedTextField(
            value = text,
            onValueChange = onTextChange,
            modifier = Modifier.weight(1f),
            maxLines = 4,
            placeholder = { Text("Send a loving note…") }
        )
        IconButton(onClick = onSend, enabled = text.isNotBlank()) {
            Icon(imageVector = Icons.Default.Send, contentDescription = "Send")
        }
    }
}

@Composable
private fun KhadijaComposer(isRecording: Boolean, onToggleRecord: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Button(onClick = onToggleRecord, shape = CircleShape) {
            Icon(imageVector = Icons.Default.Mic, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(text = if (isRecording) "Stop" else "Reply")
        }
    }
}

@Composable
private fun LinearLoader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(modifier = Modifier.height(24.dp))
    }
}
