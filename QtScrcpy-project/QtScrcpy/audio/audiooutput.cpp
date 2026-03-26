#include <QAudioOutput>
#include <QCoreApplication>
#include <QElapsedTimer>
#include <QHostAddress>
#include <QTcpSocket>
#include <QTime>
#include <QTimer>

#if (QT_VERSION >= QT_VERSION_CHECK(6, 0, 0))
#include <QAudioSink>
#include <QAudioDevice>
#include <QMediaDevices>
#endif

#include "audiooutput.h"

// 200ms audio buffer: 48000 Hz * 2 channels * 2 bytes/sample * 200ms / 1000
static constexpr int kAudioBufferSize = 48000 * 2 * 2 * 200 / 1000; // 38400 bytes

// Pre-buffer threshold: accumulate this much data before starting playback.
// 100ms = 19200 bytes. This prevents immediate IdleState on start.
static constexpr int kPreBufferThreshold = 48000 * 2 * 2 * 100 / 1000; // 19200 bytes

AudioOutput::AudioOutput(QObject *parent)
    : QObject(parent)
{
    m_running = false;
#if (QT_VERSION < QT_VERSION_CHECK(6, 0, 0))
    m_audioOutput = nullptr;
#else
    m_audioSink = nullptr;
#endif
    connect(&m_sndcpy, &QProcess::readyReadStandardOutput, this, [this]() {
        qInfo() << QString("AudioOutput::") << QString(m_sndcpy.readAllStandardOutput());
    });
    connect(&m_sndcpy, &QProcess::readyReadStandardError, this, [this]() {
        qInfo() << QString("AudioOutput::") << QString(m_sndcpy.readAllStandardError());
    });
}

AudioOutput::~AudioOutput()
{
    if (QProcess::NotRunning != m_sndcpy.state()) {
        m_sndcpy.kill();
    }
    stop();
}

bool AudioOutput::start(const QString& serial, int port)
{
    if (m_running) {
        stop();
    }

    QElapsedTimer timeConsumeCount;
    timeConsumeCount.start();
    bool ret = runSndcpyProcess(serial, port);
    qInfo() << "AudioOutput::run sndcpy cost:" << timeConsumeCount.elapsed() << "milliseconds";
    if (!ret) {
        return ret;
    }

    // Audio output is created on the worker thread inside startRecvData(),
    // after enough data has been pre-buffered. This keeps socket + audio on the same thread.
    startRecvData(port);

    m_running = true;
    return true;
}

void AudioOutput::stop()
{
    if (!m_running) {
        return;
    }
    m_running = false;

    // stopRecvData() also cleans up audio output after the worker thread stops
    stopRecvData();
}

void AudioOutput::installonly(const QString &serial, int port)
{
    runSndcpyProcess(serial, port, false);
}

bool AudioOutput::runSndcpyProcess(const QString &serial, int port, bool wait)
{
    if (QProcess::NotRunning != m_sndcpy.state()) {
        m_sndcpy.kill();
    }

#ifdef Q_OS_WIN32
    QStringList params{serial, QString::number(port)};
    m_sndcpy.start("sndcpy.bat", params);
#else
    QStringList params{"sndcpy.sh", serial, QString::number(port)};
    m_sndcpy.setWorkingDirectory(QCoreApplication::applicationDirPath());
    m_sndcpy.start("bash", params);
#endif

    if (!wait) {
        return true;
    }

    if (!m_sndcpy.waitForStarted()) {
        qWarning() << "AudioOutput::start sndcpy process failed";
        return false;
    }
    if (!m_sndcpy.waitForFinished()) {
        qWarning() << "AudioOutput::sndcpy process crashed";
        return false;
    }

    return true;
}

void AudioOutput::startRecvData(int port)
{
    if (m_workerThread.isRunning()) {
        stopRecvData();
    }

    m_preBuffer.clear();

    auto audioSocket = new QTcpSocket();
    audioSocket->moveToThread(&m_workerThread);
    connect(&m_workerThread, &QThread::finished, audioSocket, &QObject::deleteLater);

    // Drain timer: steadily feeds data from m_preBuffer into the audio output
    auto drainTimer = new QTimer();
    drainTimer->setInterval(5);
    drainTimer->moveToThread(&m_workerThread);
    connect(&m_workerThread, &QThread::finished, drainTimer, &QObject::deleteLater);
    connect(drainTimer, &QTimer::timeout, drainTimer, [this]() {
        if (!m_outputDevice || m_preBuffer.isEmpty()) {
            return;
        }
        qint64 written = m_outputDevice->write(m_preBuffer.constData(), m_preBuffer.size());
        if (written > 0) {
            m_preBuffer.remove(0, static_cast<int>(written));
        }
    });

    // Socket connection — runs on worker thread
    connect(this, &AudioOutput::connectTo, audioSocket, [audioSocket](int port) {
        audioSocket->connectToHost(QHostAddress::LocalHost, port);
        if (!audioSocket->waitForConnected(500)) {
            qWarning("AudioOutput::audio socket connect failed");
            return;
        }
        qInfo("AudioOutput::audio socket connect success");
    });

    // Data reception — runs on worker thread (same thread as audio output)
    // All socket data goes into m_preBuffer; the drain timer feeds it to audio output.
    connect(audioSocket, &QIODevice::readyRead, audioSocket, [this, audioSocket, drainTimer]() {
        qint64 recv = audioSocket->bytesAvailable();
        if (m_buffer.size() < recv) {
            m_buffer.resize(recv);
        }
        qint64 count = audioSocket->read(m_buffer.data(), recv);
        if (count <= 0) {
            return;
        }

        // Always append to intermediate buffer
        m_preBuffer.append(m_buffer.data(), count);

        // If audio output already exists, the drain timer handles writing
        if (m_outputDevice) {
            return;
        }

        // Not enough data to start yet
        if (m_preBuffer.size() < kPreBufferThreshold) {
            return;
        }

        // Enough data accumulated — create audio output on this thread
#if (QT_VERSION < QT_VERSION_CHECK(6, 0, 0))
        if (m_audioOutput) {
            return;
        }

        QAudioFormat format;
        format.setSampleRate(48000);
        format.setChannelCount(2);
        format.setSampleSize(16);
        format.setCodec("audio/pcm");
        format.setByteOrder(QAudioFormat::LittleEndian);
        format.setSampleType(QAudioFormat::SignedInt);
        QAudioDeviceInfo info(QAudioDeviceInfo::defaultOutputDevice());

        if (!info.isFormatSupported(format)) {
            qWarning() << "AudioOutput::audio format not supported, cannot play audio.";
            return;
        }

        m_audioOutput = new QAudioOutput(format);
        connect(m_audioOutput, &QAudioOutput::stateChanged, m_audioOutput, [](QAudio::State state) {
            qInfo() << "AudioOutput::audio state changed:" << state;
        });
        m_audioOutput->setBufferSize(kAudioBufferSize);
        m_outputDevice = m_audioOutput->start();
        qInfo() << "AudioOutput::audio output started, bufferSize:" << m_audioOutput->bufferSize()
                << "periodSize:" << m_audioOutput->periodSize();
#else
        if (m_audioSink) {
            return;
        }

        QAudioFormat format;
        format.setSampleRate(48000);
        format.setChannelCount(2);
        format.setSampleFormat(QAudioFormat::Int16);
        QAudioDevice defaultDevice = QMediaDevices::defaultAudioOutput();
        if (!defaultDevice.isFormatSupported(format)) {
            qWarning() << "AudioOutput::audio format not supported, cannot play audio.";
            return;
        }

        m_audioSink = new QAudioSink(defaultDevice, format);
        m_audioSink->setBufferSize(kAudioBufferSize);
        m_outputDevice = m_audioSink->start();
        if (!m_outputDevice) {
            qWarning() << "AudioOutput::audio output device not available, cannot play audio.";
            delete m_audioSink;
            m_audioSink = nullptr;
            return;
        }
        qInfo() << "AudioOutput::audio output started, bufferSize:" << m_audioSink->bufferSize();
#endif

        if (m_outputDevice) {
            // Start the drain timer — it will flush m_preBuffer into audio output
            drainTimer->start();
        }
    });

    connect(audioSocket, &QTcpSocket::stateChanged, audioSocket, [](QAbstractSocket::SocketState state) {
        qInfo() << "AudioOutput::audio socket state changed:" << state;
    });
#if QT_VERSION >= QT_VERSION_CHECK(5, 15, 0)
    connect(audioSocket, &QTcpSocket::errorOccurred, audioSocket, [](QAbstractSocket::SocketError error) {
        qInfo() << "AudioOutput::audio socket error occurred:" << error;
    });
#else
    connect(audioSocket, QOverload<QAbstractSocket::SocketError>::of(&QAbstractSocket::error), audioSocket, [](QAbstractSocket::SocketError error) {
        qInfo() << "AudioOutput::audio socket error occurred:" << error;
    });
#endif

    m_workerThread.start();
    emit connectTo(port);
}

void AudioOutput::stopRecvData()
{
    if (!m_workerThread.isRunning()) {
        return;
    }

    // Stop the worker thread and wait for it to finish.
    // The drain timer and socket are cleaned up automatically via deleteLater
    // connected to QThread::finished.
    m_workerThread.quit();
    m_workerThread.wait();

    // After the thread has fully stopped, clean up audio objects from the main thread.
    // This is safe because the worker thread is no longer running — no concurrent access.
#if (QT_VERSION < QT_VERSION_CHECK(6, 0, 0))
    if (m_audioOutput) {
        m_audioOutput->stop();
        delete m_audioOutput;
        m_audioOutput = nullptr;
    }
#else
    if (m_audioSink) {
        m_audioSink->stop();
        delete m_audioSink;
        m_audioSink = nullptr;
    }
#endif
    m_outputDevice = nullptr;
    m_preBuffer.clear();
}
