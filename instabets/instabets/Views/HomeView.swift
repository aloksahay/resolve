
//
//  HomeView.swift
//  instabets
//

import AVFoundation
import SwiftUI

// MARK: - Demo scenario config

struct DemoScenario {
    let question: String
    let streamURL: String
    let localVideo: String  // filename in bundle (no extension)
    let resolveAfter: Int   // seconds (on-chain timer)
    let resolveYes: Bool
}

private let scenarios: [DemoScenario] = [
    DemoScenario(
        question: "Will the skateboarder hit someone?",
        streamURL: "https://www.youtube.com/shorts/AQTAKC69dXc",
        localVideo: "skate",
        resolveAfter: 8,
        resolveYes: true
    ),
    DemoScenario(
        question: "Does the cat knock over the paper wall?",
        streamURL: "https://www.youtube.com/shorts/AIt99qiWWnM",
        localVideo: "cat",
        resolveAfter: 12,
        resolveYes: false
    ),
]

private let nowScenarios: [DemoScenario] = [
    DemoScenario(
        question: "Will the spoon break?",
        streamURL: "https://www.youtube.com/shorts/AQTAKC69dXc",
        localVideo: "1",
        resolveAfter: 15,
        resolveYes: true
    ),
    DemoScenario(
        question: "Does he catch it?",
        streamURL: "https://www.youtube.com/shorts/AIt99qiWWnM",
        localVideo: "2",
        resolveAfter: 20,
        resolveYes: false
    ),
    DemoScenario(
        question: "Will they both fall?",
        streamURL: "https://www.youtube.com/shorts/AQTAKC69dXc",
        localVideo: "3",
        resolveAfter: 18,
        resolveYes: true
    ),
]

// MARK: - Per-video market state

@Observable
@MainActor
final class DemoMarketState {
    let scenario: DemoScenario

    var marketId: Int? = nil
    var yesPool: Double = 0
    var noPool: Double = 0
    var outcome: String = "Pending"   // "Pending" | "Yes" | "No"
    var isCreating = false

    private let backend = BackendService()
    private var pollingTask: Task<Void, Never>?

    init(scenario: DemoScenario) { self.scenario = scenario }

    func activate() {
        guard marketId == nil, !isCreating else { return }
        isCreating = true
        Task {
            do {
                let result = try await backend.createLiveMarket(
                    condition: scenario.question,
                    streamURL: scenario.streamURL,
                    durationSeconds: scenario.resolveAfter + 30,
                    autoResolveAfter: scenario.resolveAfter,
                    autoResolveYes: scenario.resolveYes
                )
                marketId = result.marketId
                isCreating = false
                startPolling()
            } catch {
                isCreating = false
                print("⚠️ Demo market creation failed: \(error)")
            }
        }
    }

    private func startPolling() {
        pollingTask?.cancel()
        pollingTask = Task { @MainActor in
            while !Task.isCancelled {
                if let id = marketId,
                   let market = try? await backend.getMarket(id: id) {
                    outcome = market.outcome
                    yesPool = (Double(market.yesPool) ?? 0) / 1e18
                    noPool  = (Double(market.noPool)  ?? 0) / 1e18
                    if outcome != "Pending" {
                        pollingTask?.cancel()
                        return
                    }
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    func deactivate() {
        pollingTask?.cancel()
    }
}

// MARK: - HomeView

struct HomeView: View {
    var onNewBet: () -> Void = {}

    @State private var currentIndex: Int? = 0
    @State private var states: [DemoMarketState] = scenarios.map { DemoMarketState(scenario: $0) }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(scenarios.enumerated()), id: \.offset) { index, scenario in
                        VideoShortView(state: states[index], isPlaying: currentIndex == index, onNewBet: onNewBet)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .id(index)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentIndex)
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
    }
}

// MARK: - VideoShortView

struct VideoShortView: View {
    let state: DemoMarketState
    let isPlaying: Bool
    var onNewBet: () -> Void = {}

    @State private var showAlert = false

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black

            LocalVideoView(name: state.scenario.localVideo, isPlaying: isPlaying)
                .ignoresSafeArea()

            BetPollOverlay(state: state)
                .padding(.horizontal, 16)
                .padding(.bottom, 100)

            ResolutionBadge(outcome: resolvedOutcome)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 56)
                .padding(.trailing, 16)
        }
        .onChange(of: isPlaying) { _, playing in
            if playing { state.activate() }
            else { state.deactivate() }
        }
        .onAppear { if isPlaying { state.activate() } }
        .onDisappear { state.deactivate() }
        .onChange(of: state.outcome) { _, newOutcome in
            if newOutcome != "Pending" { showAlert = true }
        }
        .alert(alertTitle, isPresented: $showAlert) {
            Button("New InstaBet") { onNewBet() }
            Button("OK", role: .cancel) {}
        } message: {
            Text(alertMessage)
        }
    }

    private var resolvedOutcome: Bool? {
        switch state.outcome {
        case "Yes": return true
        case "No":  return false
        default:    return nil
        }
    }

    private var alertTitle: String {
        switch state.outcome {
        case "Yes": return "✅ YES Wins!"
        case "No":  return "❌ NO Wins!"
        default:    return "Market Resolved"
        }
    }

    private var alertMessage: String {
        let winner = state.outcome == "Yes" ? "YES" : "NO"
        return "\"\(state.scenario.question)\"\n\nResolved \(state.outcome.uppercased()). \(winner) bettors win the pool."
    }
}

// MARK: - ResolutionBadge

struct ResolutionBadge: View {
    let outcome: Bool?

    @State private var secondsLeft: Int = Int.random(in: 15...60)
    @State private var timer: Timer?

    var body: some View {
        Group {
            if let outcome {
                HStack(spacing: 6) {
                    Image(systemName: outcome ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(outcome ? .green : Color(red: 1.0, green: 0.35, blue: 0.35))
                    Text(outcome ? "YES WINS" : "NO WINS")
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
                .onAppear { stopTimer() }
                .transition(.scale.combined(with: .opacity))
            } else {
                HStack(spacing: 6) {
                    Circle().fill(.red).frame(width: 8, height: 8)
                    Text("\(secondsLeft)s")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(secondsLeft <= 10 ? .red : .white)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
                .onAppear(perform: startTimer)
                .onDisappear(perform: stopTimer)
            }
        }
        .animation(.easeInOut(duration: 0.4), value: outcome != nil)
    }

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if secondsLeft > 0 { secondsLeft -= 1 }
            else { secondsLeft = Int.random(in: 15...60) }
        }
    }
    private func stopTimer() { timer?.invalidate(); timer = nil }
}

// MARK: - BetPollOverlay

struct BetPollOverlay: View {
    let state: DemoMarketState

    private var outcome: Bool? {
        switch state.outcome {
        case "Yes": return true
        case "No":  return false
        default:    return nil
        }
    }

    private var yesAmount: Double { state.yesPool > 0 ? state.yesPool : 0.10 }
    private var noAmount:  Double { state.noPool  > 0 ? state.noPool  : 0.10 }
    private var total:     Double { yesAmount + noAmount }
    private var yesPercent: Int { total > 0 ? Int((yesAmount / total) * 100) : 50 }
    private var noPercent:  Int { 100 - yesPercent }

    var body: some View {
        VStack(spacing: 8) {
            Text(state.scenario.question)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .shadow(radius: 4)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 16).fill(.ultraThinMaterial)

                    RoundedRectangle(cornerRadius: 16)
                        .fill(yesBarColor)
                        .frame(width: geo.size.width * CGFloat(yesPercent) / 100)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .animation(.easeInOut(duration: 0.5), value: yesPercent)

                    HStack(spacing: 0) {
                        VStack(spacing: 2) {
                            Text("YES")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(yesLabelColor)
                            Text(String(format: "%.2f A0GI", yesAmount))
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("\(yesPercent)%")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity)

                        Rectangle().fill(.white.opacity(0.2)).frame(width: 1, height: 44)

                        VStack(spacing: 2) {
                            Text("NO")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(noLabelColor)
                            Text(String(format: "%.2f A0GI", noAmount))
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("\(noPercent)%")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .padding(.vertical, 10)
                }
            }
            .frame(height: 72)
            .animation(.easeInOut(duration: 0.5), value: outcome)
        }
    }

    private var yesBarColor: Color {
        switch outcome {
        case true:  return Color(red: 0.4, green: 0.9, blue: 0.75).opacity(0.5)
        case false: return Color.red.opacity(0.15)
        case nil:   return Color(red: 0.4, green: 0.9, blue: 0.75).opacity(0.25)
        }
    }
    private var yesLabelColor: Color {
        outcome == false ? .white.opacity(0.4) : Color(red: 0.4, green: 0.95, blue: 0.8)
    }
    private var noLabelColor: Color {
        outcome == true ? .white.opacity(0.4) : Color(red: 1.0, green: 0.55, blue: 0.45)
    }
}

// MARK: - LocalVideoView

struct LocalVideoView: UIViewRepresentable {
    let name: String
    let isPlaying: Bool

    class HomePlayerUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> HomePlayerUIView {
        let view = HomePlayerUIView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspectFill

        if let url = Bundle.main.url(forResource: name, withExtension: "mp4", subdirectory: "Assets") {
            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item)
            context.coordinator.player = player
            view.playerLayer.player = player

            NotificationCenter.default.addObserver(
                context.coordinator,
                selector: #selector(Coordinator.playerDidFinish),
                name: .AVPlayerItemDidPlayToEndTime,
                object: item
            )
        } else {
            print("⚠️ [LocalVideo] Could not find \(name).mp4 in bundle")
        }
        return view
    }

    func updateUIView(_ uiView: HomePlayerUIView, context: Context) {
        let coord = context.coordinator
        if isPlaying && !coord.isActive {
            coord.isActive = true
            coord.player?.seek(to: .zero)
            coord.player?.play()
        } else if !isPlaying && coord.isActive {
            coord.isActive = false
            coord.player?.pause()
        }
    }

    class Coordinator: NSObject {
        var player: AVPlayer?
        var isActive = false

        @objc func playerDidFinish() {
            player?.pause()
            isActive = false
        }
    }
}

// MARK: - NowView

struct NowView: View {
    var onNewBet: () -> Void = {}

    @State private var currentIndex: Int? = 0
    @State private var states: [DemoMarketState] = nowScenarios.map { DemoMarketState(scenario: $0) }

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(nowScenarios.enumerated()), id: \.offset) { index, _ in
                        VideoShortView(state: states[index], isPlaying: currentIndex == index, onNewBet: onNewBet)
                            .frame(width: geo.size.width, height: geo.size.height)
                            .id(index)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollPosition(id: $currentIndex)
            .ignoresSafeArea()
        }
        .ignoresSafeArea()
        .preferredColorScheme(.dark)
    }
}

#Preview {
    HomeView(onNewBet: {})
}
