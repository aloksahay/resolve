//
//  RTMPStreamingService.swift
//  instabets
//
//  RTMP streaming to Mux using HaishinKit
//

import HaishinKit
import AVFoundation
import Foundation
import RTMPHaishinKit

enum StreamingError: Error {
    case cameraNotFound
    case micNotFound
}

@MainActor
final class RTMPStreamingService {
    private let rtmpConnection = RTMPConnection()
    private var rtmpStream: RTMPStream!
    private let mixer = MediaMixer()
    
    init() {
        rtmpStream = RTMPStream(connection: rtmpConnection)
    }
    
    // Expose stream for camera preview
    var stream: RTMPStream {
        rtmpStream
    }
    
    // MARK: - Setup
    
    func setupDevices() async throws {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) else {
            throw StreamingError.cameraNotFound
        }
        guard let mic = AVCaptureDevice.default(for: .audio) else {
            throw StreamingError.micNotFound
        }
        
        // 480p portrait @ 500 kbps video + 64 kbps audio — keeps Mux usage low
        try await rtmpStream.setVideoSettings(VideoCodecSettings(
            videoSize: CGSize(width: 480, height: 854),
            bitRate: 500_000
        ))
        try await rtmpStream.setAudioSettings(AudioCodecSettings(bitRate: 64_000))

        // Attach devices to the mixer
        try await mixer.attachVideo(camera)
        try await mixer.attachAudio(mic)

        // Add the stream as an output of the mixer
        await mixer.addOutput(rtmpStream)
    }
    
    // MARK: - Streaming
    
    func startPublishing(streamKey: String) async throws {
        _ = try await rtmpConnection.connect(Config.muxIngestBase)
        _ = try await rtmpStream.publish(streamKey)
    }
    
    func stopPublishing() async throws {
        _ = try await rtmpStream.close()
        try await rtmpConnection.close()
    }
}
