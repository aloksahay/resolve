//
//  BackendService.swift
//  instabets
//
//  Calls the instabets backend to register a live prediction market.
//

import Foundation

actor BackendService {
    private let baseURL = URL(string: Config.backendBaseURL)!

    struct LiveMarketResponse: Decodable {
        let marketId: Int
        let txHash: String
        let jobId: String?
        let storageRoot: String
        let condition: String
        let stream_url: String
        let deadline: Int
    }

    func createLiveMarket(condition: String, streamURL: String, durationSeconds: Int = 60, autoResolveAfter: Int? = nil, autoResolveYes: Bool? = nil) async throws -> LiveMarketResponse {
        let url = baseURL.appending(path: "/markets/live")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // ngrok requires this header to skip the browser warning page
        request.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")

        var body: [String: Any] = [
            "condition": condition,
            "stream_url": streamURL,
            "duration_seconds": durationSeconds
        ]
        if let after = autoResolveAfter { body["auto_resolve_after"] = after }
        if let yes = autoResolveYes     { body["auto_resolve_yes"] = yes }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, http.statusCode == 201 else {
            let body = String(data: data, encoding: .utf8) ?? "<no body>"
            throw BackendError.badResponse(body)
        }

        return try JSONDecoder().decode(LiveMarketResponse.self, from: data)
    }

    struct MarketOutcomeResponse: Decodable {
        struct Market: Decodable {
            let id: Int
            let question: String
            let deadline: Int
            let outcome: String   // "Pending" | "Yes" | "No"
            let yesPool: String
            let noPool: String
        }
        let market: Market
    }

    func getMarket(id: Int) async throws -> MarketOutcomeResponse.Market {
        let url = baseURL.appending(path: "/markets/\(id)")
        var request = URLRequest(url: url)
        request.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? "<no body>"
            throw BackendError.badResponse(body)
        }
        return try JSONDecoder().decode(MarketOutcomeResponse.self, from: data).market
    }

    struct MarketBetsResponse: Decodable {
        let yesTotal: String
        let noTotal: String
    }

    func getMarketBets(id: Int) async throws -> MarketBetsResponse {
        let url = baseURL.appending(path: "/markets/\(id)/bets")
        var request = URLRequest(url: url)
        request.setValue("true", forHTTPHeaderField: "ngrok-skip-browser-warning")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            let body = String(data: data, encoding: .utf8) ?? "<no body>"
            throw BackendError.badResponse(body)
        }
        return try JSONDecoder().decode(MarketBetsResponse.self, from: data)
    }

    enum BackendError: LocalizedError {
        case badResponse(String)
        var errorDescription: String? {
            if case .badResponse(let body) = self { return "Backend error: \(body)" }
            return nil
        }
    }
}
