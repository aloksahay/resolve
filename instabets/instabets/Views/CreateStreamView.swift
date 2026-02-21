
//
//  CreateStreamView.swift
//  instabets
//

import AVFoundation
import SwiftUI

// MARK: - Looping local background video

private class PlayerView: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

private struct LoopingVideoBackground: UIViewRepresentable {
    let name: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> PlayerView {
        let view = PlayerView()
        view.backgroundColor = .black
        view.playerLayer.videoGravity = .resizeAspectFill
        
        // Set up initial video
        setupVideo(name: name, view: view, context: context)
        
        return view
    }

    func updateUIView(_ uiView: PlayerView, context: Context) {
        // Only change video if the name actually changed
        if context.coordinator.currentVideoName != name {
            setupVideo(name: name, view: uiView, context: context)
        }
    }
    
    private func setupVideo(name: String, view: PlayerView, context: Context) {
        // Clean up old player if it exists
        context.coordinator.looper?.disableLooping()
        context.coordinator.looper = nil
        context.coordinator.player?.pause()
        context.coordinator.player = nil
        
        // Set up new video
        context.coordinator.currentVideoName = name
        
        if let url = Bundle.main.url(forResource: name, withExtension: "mp4") {
            let item = AVPlayerItem(url: url)
            let player = AVQueuePlayer()
            context.coordinator.looper = AVPlayerLooper(player: player, templateItem: item)
            context.coordinator.player = player
            view.playerLayer.player = player
            player.play()
        } else {
            print("⚠️ Could not find video file '\(name).mp4' in bundle")
        }
    }

    class Coordinator {
        var player: AVQueuePlayer?
        var looper: AVPlayerLooper?
        var currentVideoName: String?
    }
}

// MARK: - Live bet overlay

private struct LiveBetOverlay: View {
    let question: String
    let yesWei: String
    let noWei: String

    private var yesA0GI: Double { (Double(yesWei) ?? 0) / 1e18 }
    private var noA0GI: Double { (Double(noWei) ?? 0) / 1e18 }
    private var total: Double { yesA0GI + noA0GI }
    private var yesPercent: Int { total > 0 ? Int((yesA0GI / total) * 100) : 50 }
    private var noPercent: Int { 100 - yesPercent }

    var body: some View {
        VStack(spacing: 8) {
            Text(question)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .shadow(radius: 4)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.ultraThinMaterial)

                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(red: 0.4, green: 0.9, blue: 0.75).opacity(0.25))
                        .frame(width: geo.size.width * CGFloat(yesPercent) / 100)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    HStack(spacing: 0) {
                        VStack(spacing: 2) {
                            Text("YES")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color(red: 0.4, green: 0.95, blue: 0.8))
                            Text(String(format: "%.2f A0GI", yesA0GI))
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("\(yesPercent)%")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity)

                        Rectangle()
                            .fill(.white.opacity(0.2))
                            .frame(width: 1, height: 44)

                        VStack(spacing: 2) {
                            Text("NO")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(Color(red: 1.0, green: 0.55, blue: 0.45))
                            Text(String(format: "%.2f A0GI", noA0GI))
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
        }
    }
}

// MARK: - Main view

struct CreateStreamView: View {
    @State private var viewModel = CreateStreamViewModel()
    @FocusState private var focusedField: Field?

    enum Field { case condition }

    private var isComplete: Bool {
        if case .complete = viewModel.phase { return true }
        return false
    }

    private var backgroundVideo: (name: String, blur: Bool) {
        guard isComplete else { return ("bg", true) }
        let lower = viewModel.condition.lowercased()
        if lower.contains("fall") || lower.contains("skate") { return ("skate", false) }
        if lower.contains("cat") { return ("cat", false) }
        return ("bg", true)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Background: video matched to bet title
                LoopingVideoBackground(name: backgroundVideo.name)
                    .ignoresSafeArea()
                    .blur(radius: backgroundVideo.blur ? 12 : 0)
                Color.black.opacity(backgroundVideo.blur ? 0.45 : 0.25).ignoresSafeArea()

                // Keyboard dismiss
                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea()
                    .onTapGesture { focusedField = nil }

                // Center content (form / status / success)
                ScrollView {
                    VStack(spacing: 24) {
                        Spacer().frame(height: 100)
                        phaseContent
                        Spacer().frame(height: isComplete ? 180 : 100)
                        actionBar
                    }
                    .frame(minHeight: UIScreen.main.bounds.height - 100)
                    .padding()
                }
                .scrollDismissesKeyboard(.interactively)
                .onTapGesture { focusedField = nil }

                // Bet overlay — pinned to bottom once market is created
                if isComplete {
                    VStack {
                        Spacer()
                        LiveBetOverlay(
                            question: viewModel.condition,
                            yesWei: viewModel.yesPoolWei,
                            noWei: viewModel.noPoolWei
                        )
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }
                    .ignoresSafeArea(edges: .bottom)
                    .allowsHitTesting(false)
                }
            }
            .navigationTitle("InstaBet Now!")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Phase content

    @ViewBuilder
    private var phaseContent: some View {
        switch viewModel.phase {
        case .idle:
            idleForm
        case .submitting:
            statusView(icon: "antenna.radiowaves.left.and.right", text: "Creating market…")
        case .complete:
            VStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(.green)
                Text("Market Created!")
                    .font(.title3.bold())
                    .foregroundStyle(.white)
            }
        case .failed(let error):
            failedView(error: error)
        }
    }

    private var idleForm: some View {
        VStack(spacing: 16) {
            TextField(
                "What's your prediction? (e.g. Bitcoin hits $100k today)",
                text: $viewModel.condition,
                axis: .vertical
            )
            .lineLimit(5...8)
            .padding(16)
            .frame(minHeight: 120, alignment: .topLeading)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(.white)
            .focused($focusedField, equals: .condition)
        }
    }

    // MARK: - Action bar

    @ViewBuilder
    private var actionBar: some View {
        switch viewModel.phase {
        case .idle:
            Button("Create InstaBet") {
                focusedField = nil
                Task { await viewModel.createMarket() }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!viewModel.canSubmit)

        case .complete:
            EmptyView()

        case .failed:
            Button("Try Again") { viewModel.reset() }
                .buttonStyle(.borderedProminent)

        default:
            EmptyView()
        }
    }

    // MARK: - Sub-views

    private func failedView(error: Error) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(.yellow)
            Text("Something went wrong")
                .font(.title3.bold())
                .foregroundStyle(.white)
            Text(error.localizedDescription)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func statusView(icon: String, text: String) -> some View {
        VStack(spacing: 16) {
            ProgressView().tint(.white).scaleEffect(1.5)
            Image(systemName: icon).font(.system(size: 36)).foregroundStyle(.white)
            Text(text).font(.headline).foregroundStyle(.white)
        }
    }
}

#Preview {
    CreateStreamView()
        .preferredColorScheme(.dark)
}
