package com.chatkhanavadegi.model

enum class Persona(val id: String, val displayName: String, val locale: String) {
    Khadija(id = "khadija", displayName = "خديجه", locale = "fa"),
    Brian(id = "brian", displayName = "Brian", locale = "en");

    companion object {
        fun fromId(id: String?): Persona? = entries.firstOrNull { it.id == id }
    }
}
