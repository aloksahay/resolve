
//
//  CreateStreamView.swift
//  instabets
//

import AVFoundation
import SwiftUI
import WebKit

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

        if let url = Bundle.main.url(forResource: name, withExtension: "mp4", subdirectory: "Assets") {
            let item = AVPlayerItem(url: url)
            let player = AVQueuePlayer()
            context.coordinator.looper = AVPlayerLooper(player: player, templateItem: item)
            context.coordinator.player = player
            view.playerLayer.player = player
            player.play()
        }
        return view
    }

    func updateUIView(_ uiView: PlayerView, context: Context) {}

    class Coordinator {
        var player: AVQueuePlayer?
        var looper: AVPlayerLooper?
    }
}

// MARK: - YouTube embed background

private struct YouTubeBackground: UIViewRepresentable {
    let videoID: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black

        let html = """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
            <style>
                * { margin: 0; padding: 0; background: #000; }
                html, body { width: 100%; height: 100%; overflow: hidden; }
                iframe { width: 100%; height: 100%; border: none; }
            </style>
        </head>
        <body>
            <iframe
                src="https://www.youtube.com/embed/\(videoID)?autoplay=1&mute=1&loop=1&playlist=\(videoID)&controls=0&playsinline=1&rel=0&showinfo=0&enablejsapi=1"
                allow="autoplay; encrypted-media"
                allowfullscreen>
            </iframe>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: URL(string: "https://www.youtube.com"))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
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

// MARK: - Helpers

private func extractYouTubeID(from urlString: String) -> String? {
    guard let url = URL(string: urlString) else { return nil }
    if let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
       let v = items.first(where: { $0.name == "v" })?.value { return v }
    let parts = url.pathComponents
    if let idx = parts.firstIndex(of: "shorts"), idx + 1 < parts.count { return parts[idx + 1] }
    if url.host == "youtu.be" { return parts.dropFirst().first }
    return nil
}

// MARK: - Main view

struct CreateStreamView: View {
    @State private var viewModel = CreateStreamViewModel()
    @FocusState private var focusedField: Field?

    enum Field { case condition, streamURL }

    private var youtubeID: String? { extractYouTubeID(from: viewModel.streamURL) }

    private var isComplete: Bool {
        if case .complete = viewModel.phase { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Background: YouTube video (no blur) if URL is set, else blurred bg.mp4
                if let videoID = youtubeID {
                    YouTubeBackground(videoID: videoID)
                        .ignoresSafeArea()
                    Color.black.opacity(0.35).ignoresSafeArea()
                } else {
                    LoopingVideoBackground(name: "bg")
                        .ignoresSafeArea()
                        .blur(radius: 12)
                    Color.black.opacity(0.45).ignoresSafeArea()
                }

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

            TextField(
                "YouTube link",
                text: $viewModel.streamURL
            )
            .keyboardType(.URL)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .padding(16)
            .frame(minHeight: 52)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(.white)
            .focused($focusedField, equals: .streamURL)
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
