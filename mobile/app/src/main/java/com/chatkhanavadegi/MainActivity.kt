package com.chatkhanavadegi

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import com.chatkhanavadegi.ui.ChatScreen
import com.chatkhanavadegi.ui.ChatViewModel
import com.chatkhanavadegi.ui.ChatViewModelFactory
import com.chatkhanavadegi.ui.theme.ChatKhanavadegiTheme

class MainActivity : ComponentActivity() {

    private lateinit var appContainer: AppContainer

    private val viewModel: ChatViewModel by viewModels {
        ChatViewModelFactory(appContainer.personaStore, appContainer.chatRepository)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        appContainer = AppContainer(this)

        setContent {
            ChatKhanavadegiTheme {
                ChatScreen(viewModel = viewModel)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        appContainer.chatRepository.disconnectSocket()
    }
}
