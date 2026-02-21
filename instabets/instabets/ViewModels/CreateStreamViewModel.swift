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
    var condition: String = ""
    private(set) var marketStorageRoot: String = ""
    private(set) var marketOutcome: String = "Pending"  // "Pending" | "Yes" | "No"
    private var marketId: Int? = nil

    private let muxService = MuxService()
    private let rtmpService = RTMPStreamingService()
    private let recordingService = LocalRecordingService()
    private let backendService = BackendService()
    
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

            // Start publishing to Mux
            try await rtmpService.startPublishing(streamKey: streamKey)

            // Register prediction market on the backend
            let streamURL = "\(Config.muxPlaybackBase)/\(playbackID).m3u8"
            Task {
                do {
                    let result = try await backendService.createLiveMarket(
                        condition: condition,
                        streamURL: streamURL,
                        durationSeconds: streamDuration
                    )
                    self.marketStorageRoot = result.storageRoot
                    self.marketId = result.marketId
                    print("✅ Market created: id=\(result.marketId) tx=\(result.txHash)")
                } catch {
                    print("⚠️ Backend market creation failed: \(error.localizedDescription)")
                }
            }

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
        try? await rtmpService.stopPublishing()
        let _ = recordingService.stopRecording()

        let playbackID = currentPlaybackID
        let cid = marketStorageRoot.isEmpty ? "pending" : marketStorageRoot

        guard let id = marketId else {
            phase = .complete(cid: cid, playbackID: playbackID)
            return
        }

        phase = .resolving
        await pollOutcome(marketId: id, playbackID: playbackID, cid: cid)
    }

    private func pollOutcome(marketId: Int, playbackID: String, cid: String) async {
        // Poll every 5s, give up after 2 minutes (24 attempts)
        for _ in 0..<24 {
            do {
                let market = try await backendService.getMarket(id: marketId)
                if market.outcome != "Pending" {
                    marketOutcome = market.outcome
                    phase = .complete(cid: cid, playbackID: playbackID)
                    return
                }
            } catch {
                print("⚠️ Poll error: \(error.localizedDescription)")
            }
            try? await Task.sleep(for: .seconds(5))
        }
        // Timed out — show complete with last known outcome
        phase = .complete(cid: cid, playbackID: playbackID)
    }

    // MARK: - Reset

    func reset() {
        phase = .idle
        errorMessage = nil
        marketOutcome = "Pending"
        marketId = nil
        marketStorageRoot = ""
    }
    
    private var currentPlaybackID: String {
        if case .live(_, let id) = phase { return id }
        return ""
    }
}
