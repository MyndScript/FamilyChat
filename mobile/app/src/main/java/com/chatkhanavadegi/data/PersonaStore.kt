package com.chatkhanavadegi.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.chatkhanavadegi.model.Persona
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.personaDataStore by preferencesDataStore(name = "persona")

class PersonaStore(private val context: Context) {
    private val keyPersonaId = stringPreferencesKey("persona_id")

    val personaFlow: Flow<Persona?> = context.personaDataStore.data.map { prefs ->
        Persona.fromId(prefs[keyPersonaId])
    }

    suspend fun savePersona(persona: Persona) {
        context.personaDataStore.edit { prefs ->
            prefs[keyPersonaId] = persona.id
        }
    }
}
