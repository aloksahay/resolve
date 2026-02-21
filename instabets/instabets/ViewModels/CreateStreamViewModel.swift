//
//  CreateStreamViewModel.swift
//  instabets
//
//  Stream lifecycle: idle → preparing → readyToGo → live → complete
//

import HaishinKit
import RTMPHaishinKit
import Foundation
import Observation

private let streamDuration = 60

@Observable
@MainActor
final class CreateStreamViewModel {
    var phase: StreamPhase = .idle
    var errorMessage: String?
    var shareURL: URL?
    
    private let muxService = MuxService()
    private let rtmpService = RTMPStreamingService()
    private let recordingService = LocalRecordingService()
    
    var stream: RTMPStream {
        rtmpService.stream
    }
    
    // MARK: - Step 1: Prepare
    
    func prepareStream() async {
        phase = .preparing
        errorMessage = nil
        
        do {
            // Setup camera/mic (now async)
            try await rtmpService.setupDevices()
            
            // Create Mux live stream
            let (streamKey, playbackID) = try await muxService.createLiveStream()
            
            shareURL = URL(string: "\(Config.muxPlaybackBase)/\(playbackID)")
            phase = .readyToGo(streamKey: streamKey, playbackID: playbackID)
        } catch {
            phase = .failed(error)
            errorMessage = error.localizedDescription
        }
    }
    
    // MARK: - Step 2: Go Live
    
    func goLive(streamKey: String, playbackID: String) async {
        do {
            // Start recording (stub for now)
            try recordingService.startRecording()
            
            // Start publishing to Mux (now async)
            try await rtmpService.startPublishing(streamKey: streamKey)
            
            // Countdown 60 seconds
            for remaining in stride(from: streamDuration, through: 0, by: -1) {
                phase = .live(secondsRemaining: remaining, playbackID: playbackID)
                if remaining == 0 { break }
                try await Task.sleep(for: .seconds(1))
            }
            
            await finishStream()
        } catch {
            phase = .failed(error)
            errorMessage = error.localizedDescription
        }
    }
    
    // MARK: - Step 3: Finish
    
    func finishStream() async {
        // Stop streaming (now async)
        try? await rtmpService.stopPublishing()
        
        // Stop recording
        let _ = recordingService.stopRecording()
        
        // For now, just mark as complete without upload
        phase = .complete(cid: "no-recording-yet", playbackID: currentPlaybackID)
    }
    
    // MARK: - Reset
    
    func reset() {
        phase = .idle
        errorMessage = nil
        shareURL = nil
    }
    
    private var currentPlaybackID: String {
        if case .live(_, let id) = phase { return id }
        return ""
    }
}
