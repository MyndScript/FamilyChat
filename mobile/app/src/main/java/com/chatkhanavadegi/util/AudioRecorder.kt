package com.chatkhanavadegi.util

import android.content.Context
import android.media.MediaRecorder
import java.io.File
import java.io.IOException

class AudioRecorder(private val context: Context) {
    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null

    fun start(): File {
        stop()
        val newFile = File.createTempFile("voice_message", ".m4a", context.cacheDir)
        val mediaRecorder = MediaRecorder().apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioEncodingBitRate(128_000)
            setAudioSamplingRate(44_100)
            setOutputFile(newFile.absolutePath)
        }
        try {
            mediaRecorder.prepare()
            mediaRecorder.start()
        } catch (ioe: IOException) {
            mediaRecorder.reset()
            mediaRecorder.release()
            throw ioe
        }
        recorder = mediaRecorder
        outputFile = newFile
        return newFile
    }

    fun stop(): File? {
        val mediaRecorder = recorder ?: return null
        return try {
            mediaRecorder.stop()
            mediaRecorder.reset()
            mediaRecorder.release()
            recorder = null
            outputFile
        } catch (throwable: Throwable) {
            mediaRecorder.reset()
            mediaRecorder.release()
            recorder = null
            outputFile = null
            null
        }
    }

    fun dispose() {
        recorder?.reset()
        recorder?.release()
        recorder = null
    }
}
