
//
//  CreateStreamViewModel.swift
//  instabets
//

import Foundation
import Observation

@Observable
@MainActor
final class CreateStreamViewModel {
    var phase: StreamPhase = .idle
    var condition: String = ""
    var errorMessage: String?

    // Live bet pool data (wei strings, polled after market creation)
    var yesPoolWei: String = "0"
    var noPoolWei: String = "0"

    private let backendService = BackendService()
    private var pollingTask: Task<Void, Never>?

    var canSubmit: Bool {
        condition.trimmingCharacters(in: .whitespaces).count >= 5
    }

    func createMarket() async {
        guard canSubmit else { return }
        phase = .submitting
        errorMessage = nil

        do {
            let result = try await backendService.createLiveMarket(
                condition: condition,
                streamURL: ""  // No streaming - just using local videos
            )
            phase = .complete(marketId: result.marketId)
            startPollingBets(marketId: result.marketId)
        } catch {
            phase = .failed(error)
            errorMessage = error.localizedDescription
        }
    }

    private func startPollingBets(marketId: Int) {
        pollingTask?.cancel()
        pollingTask = Task { @MainActor in
            while !Task.isCancelled {
                if let bets = try? await backendService.getMarketBets(id: marketId) {
                    yesPoolWei = bets.yesTotal
                    noPoolWei = bets.noTotal
                }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    func reset() {
        pollingTask?.cancel()
        pollingTask = nil
        phase = .idle
        errorMessage = nil
        yesPoolWei = "0"
        noPoolWei = "0"
    }
}
