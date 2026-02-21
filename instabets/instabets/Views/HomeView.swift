//
//  HomeView.swift
//  instabets
//
//  Vertical shorts-style feed of local video assets.
//

import SwiftUI
import AVFoundation
import UIKit

// MARK: - Data

struct PollData {
    let question: String
    let yesAmount: Int
    let noAmount: Int

    var total: Int { yesAmount + noAmount }
    var yesPercent: Int { Int((Double(yesAmount) / Double(total)) * 100) }
    var noPercent:  Int { 100 - yesPercent }
}

private let polls: [PollData] = [
    PollData(question: "Will they score on this drive?",       yesAmount: 74,  noAmount: 21),
    PollData(question: "Will the jump shot go in?",            yesAmount: 45,  noAmount: 89),
    PollData(question: "Will the crowd rush the field?",       yesAmount: 120, noAmount: 55),
]

// MARK: - HomeView

struct HomeView: View {
    private let videoNames = ["1", "2", "3"]
    @State private var currentIndex: Int? = 0

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(videoNames.enumerated()), id: \.offset) { index, name in
                        VideoShortView(name: name, isPlaying: currentIndex == index, poll: polls[index])
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
    let name: String
    let isPlaying: Bool
    let poll: PollData

    @State private var player: AVQueuePlayer?
    @State private var looper: AVPlayerLooper?

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black

            if let player {
                PlayerLayerView(player: player)
                    .ignoresSafeArea()
            }

            BetPollOverlay(poll: poll)
                .padding(.horizontal, 16)
                .padding(.bottom, 100)

            CountdownBadge()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .padding(.top, 56)
                .padding(.trailing, 16)
        }
        .onAppear(perform: setupPlayer)
        .onDisappear(perform: cleanup)
        .onChange(of: isPlaying) { _, playing in
            playing ? player?.play() : player?.pause()
        }
    }

    private func setupPlayer() {
        guard let url = Bundle.main.url(forResource: name, withExtension: "mp4") else {
            print("⚠️ Could not find \(name).mp4 in bundle")
            return
        }
        let item = AVPlayerItem(url: url)
        let queuePlayer = AVQueuePlayer()
        looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        player = queuePlayer
        if isPlaying { queuePlayer.play() }
    }

    private func cleanup() {
        player?.pause()
        looper = nil
        player = nil
    }
}

// MARK: - CountdownBadge

struct CountdownBadge: View {
    @State private var secondsLeft: Int = Int.random(in: 15...60)
    @State private var timer: Timer?

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(.red)
                .frame(width: 8, height: 8)

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

    private func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            if secondsLeft > 0 {
                secondsLeft -= 1
            } else {
                secondsLeft = Int.random(in: 15...60)
            }
        }
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - BetPollOverlay

struct BetPollOverlay: View {
    let poll: PollData

    var body: some View {
        VStack(spacing: 8) {
            Text(poll.question)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .shadow(radius: 4)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Background
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.ultraThinMaterial)

                    // YES fill
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(red: 0.4, green: 0.9, blue: 0.75).opacity(0.25))
                        .frame(width: geo.size.width * CGFloat(poll.yesPercent) / 100)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    // Two columns
                    HStack(spacing: 0) {
                        // YES side
                        VStack(spacing: 2) {
                            Text("YES")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color(red: 0.4, green: 0.95, blue: 0.8))
                            Text("$\(poll.yesAmount)")
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("\(poll.yesPercent)%")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity)

                        // Divider
                        Rectangle()
                            .fill(.white.opacity(0.2))
                            .frame(width: 1, height: 44)

                        // NO side
                        VStack(spacing: 2) {
                            Text("NO")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color(red: 1.0, green: 0.55, blue: 0.45))
                            Text("$\(poll.noAmount)")
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("\(poll.noPercent)%")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .padding(.vertical, 10)
                }
            }
            .frame(height: 72)
        }
    }
}

// MARK: - PlayerLayerView

struct PlayerLayerView: UIViewRepresentable {
    let player: AVQueuePlayer

    func makeUIView(context: Context) -> PlayerUIView {
        let view = PlayerUIView()
        view.playerLayer.player = player
        view.playerLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {}

    final class PlayerUIView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}

#Preview {
    HomeView()
}
