
//
//  StreamPhase.swift
//  instabets
//

import Foundation

enum StreamPhase {
    case idle
    case submitting
    case complete(marketId: Int)
    case failed(Error)
}

extension StreamPhase: Equatable {
    static func == (lhs: StreamPhase, rhs: StreamPhase) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.submitting, .submitting): return true
        case (.complete(let a), .complete(let b)): return a == b
        case (.failed, .failed): return true
        default: return false
        }
    }
}
