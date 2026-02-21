
//
//  VideoCompressionService.swift
//  instabets
//
//  Compresses a recorded video using AVAssetExportSession (.medium preset)
//  to reduce file size before uploading to 0G Storage.
//

import AVFoundation
import Foundation

struct VideoCompressionService {
    /// Compresses the video at `sourceURL` and returns a URL to the compressed file.
    func compress(sourceURL: URL) async throws -> URL {
        let asset = AVURLAsset(url: sourceURL)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")

        guard let session = AVAssetExportSession(
            asset: asset,
            presetName: AVAssetExportPresetMediumQuality
        ) else {
            throw CompressionError.exportSessionUnavailable
        }

        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true

        // Use the modern throwing async export API (iOS 18+)
        try await session.export(to: outputURL, as: .mp4)

        return outputURL
    }
}

enum CompressionError: LocalizedError {
    case exportSessionUnavailable

    var errorDescription: String? {
        "Could not create AVAssetExportSession for compression"
    }
}
