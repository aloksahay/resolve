
//
//  StreamPhase.swift
//  instabets
//

import Foundation

enum StreamPhase {
    case idle
    case preparing
    case readyToGo(streamKey: String, playbackID: String)
    case live(secondsRemaining: Int, playbackID: String)
    case compressing
    case uploading
    case resolving
    case complete(cid: String, playbackID: String)
    case failed(Error)
}

extension StreamPhase: Equatable {
    static func == (lhs: StreamPhase, rhs: StreamPhase) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.preparing, .preparing): return true
        case (.readyToGo(let a, let b), .readyToGo(let c, let d)): return a == c && b == d
        case (.live(let a, let b), .live(let c, let d)): return a == c && b == d
        case (.compressing, .compressing): return true
        case (.uploading, .uploading): return true
        case (.resolving, .resolving): return true
        case (.complete(let a, let b), .complete(let c, let d)): return a == c && b == d
        case (.failed, .failed): return true
        default: return false
        }
    }
}
