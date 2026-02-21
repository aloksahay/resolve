
//
//  MuxService.swift
//  instabets
//
//  Calls the Mux Live Streams API to provision an ingest endpoint.
//  Docs: https://docs.mux.com/api-reference/video#operation/create-live-stream
//

import Foundation

actor MuxService {
    private let baseURL = URL(string: "https://api.mux.com/video/v1/live-streams")!

    /// Creates a new Mux live stream and returns the stream key + playback ID.
    func createLiveStream() async throws -> (streamKey: String, playbackID: String) {
        var request = URLRequest(url: baseURL)
        request.httpMethod = "POST"

        // Basic auth: base64("{tokenID}:{tokenSecret}")
        let credentials = "\(Config.muxTokenID):\(Config.muxTokenSecret)"
        let encoded = Data(credentials.utf8).base64EncodedString()
        request.setValue("Basic \(encoded)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "playback_policy": ["public"],
            "new_asset_settings": ["playback_policy": ["public"]]
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 201 else {
            let body = String(data: data, encoding: .utf8) ?? "<no body>"
            throw MuxError.invalidResponse(body)
        }

        let muxResponse = try JSONDecoder().decode(MuxLiveStreamResponse.self, from: data)
        let streamKey = muxResponse.data.streamKey
        guard let playbackID = muxResponse.data.playbackIDs.first?.id else {
            throw MuxError.noPlaybackID
        }

        return (streamKey: streamKey, playbackID: playbackID)
    }

    enum MuxError: LocalizedError {
        case invalidResponse(String)
        case noPlaybackID

        var errorDescription: String? {
            switch self {
            case .invalidResponse(let body): return "Mux API error: \(body)"
            case .noPlaybackID: return "Mux returned no playback ID"
            }
        }
    }
}
