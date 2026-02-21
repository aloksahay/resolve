//
//  LocalRecordingService.swift
//  instabets
//
//  Local recording - PLACEHOLDER for now
//

import Foundation

@MainActor
final class LocalRecordingService {
    private(set) var recordingURL: URL?
    
    // For now, just a stub - we'll implement this after basic streaming works
    func startRecording() throws {
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        self.recordingURL = outputURL
        print("📹 Recording stub - would record to: \(outputURL)")
    }
    
    func stopRecording() -> URL? {
        print("⏹️ Recording stub - would stop recording")
        return recordingURL
    }
}
