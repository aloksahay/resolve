
//
//  LiveStream.swift
//  instabets
//

import Foundation

struct MuxLiveStreamResponse: Codable {
    let data: LiveStreamData
}

struct LiveStreamData: Codable {
    let id: String
    let streamKey: String
    let playbackIDs: [PlaybackID]

    enum CodingKeys: String, CodingKey {
        case id
        case streamKey = "stream_key"
        case playbackIDs = "playback_ids"
    }
}

struct PlaybackID: Codable {
    let id: String
    let policy: String
}
