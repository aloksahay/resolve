
//
//  CreateStreamView.swift
//  instabets
//
//  Full streaming UI. Drives all branches from CreateStreamViewModel.phase.
//

@preconcurrency import HaishinKit
import RTMPHaishinKit
import SwiftUI
import AVFoundation

// MARK: - MTHKView SwiftUI Wrapper

struct CameraPreview: UIViewRepresentable {
    let stream: RTMPStream

    func makeUIView(context: Context) -> MTHKView {
        let view = MTHKView(frame: .zero)
        view.videoGravity = .resizeAspectFill
        Task { await stream.addOutput(view) }
        return view
    }

    func updateUIView(_ uiView: MTHKView, context: Context) {}
}

// MARK: - Create Stream View

struct CreateStreamView: View {
    @State private var viewModel = CreateStreamViewModel()
    @State private var showPlayer = false

    var body: some View {
        NavigationStack {
            ZStack {
                // Camera preview is always behind content when live
                cameraBackground

                VStack {
                    Spacer()
                    phaseContent
                    Spacer()
                    actionBar
                }
                .padding()
            }
            .navigationTitle("Go Live")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(isPresented: $showPlayer) {
                playerDestination
            }
        }
    }

    // MARK: - Subviews

    @ViewBuilder
    private var cameraBackground: some View {
        switch viewModel.phase {
        case .readyToGo, .live:
            CameraPreview(stream: viewModel.stream)
                .ignoresSafeArea(.container, edges: .top)
        default:
            Color.black.ignoresSafeArea(.container, edges: .top)
        }
    }

    @ViewBuilder
    private var phaseContent: some View {
        switch viewModel.phase {
        case .idle:
            idleView

        case .preparing:
            statusView(icon: "antenna.radiowaves.left.and.right", text: "Setting up stream…")

        case .readyToGo(let streamKey, let playbackID):
            readyView(streamKey: streamKey, playbackID: playbackID)

        case .live(let seconds, let playbackID):
            liveView(seconds: seconds, playbackID: playbackID)

        case .compressing:
            statusView(icon: "arrow.triangle.2.circlepath", text: "Compressing video…")

        case .uploading:
            statusView(icon: "icloud.and.arrow.up", text: "Uploading to 0G Network…")

        case .resolving:
            statusView(icon: "checkmark.seal", text: "Resolving prediction market…")

        case .complete(let cid, let playbackID):
            completeView(cid: cid, playbackID: playbackID)

        case .failed(let error):
            failedView(error: error)
        }
    }

    @ViewBuilder
    private var actionBar: some View {
        switch viewModel.phase {
        case .idle:
            Button("Create Stream") {
                Task { await viewModel.prepareStream() }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)

        case .readyToGo(let streamKey, let playbackID):
            Button {
                Task { await viewModel.goLive(streamKey: streamKey, playbackID: playbackID) }
            } label: {
                Label("Go Live", systemImage: "record.circle")
                    .font(.headline)
            }
            .buttonStyle(.borderedProminent)
            .tint(.red)
            .controlSize(.large)

        case .live:
            Button("Stop Early") {
                Task { await viewModel.finishStream() }
            }
            .buttonStyle(.bordered)
            .tint(.white)

        case .complete:
            Button("Start New Stream") { viewModel.reset() }
                .buttonStyle(.bordered)

        case .failed:
            Button("Try Again") { viewModel.reset() }
                .buttonStyle(.borderedProminent)

        default:
            EmptyView()
        }
    }

    // MARK: - Phase-specific views

    private var idleView: some View {
        VStack(spacing: 16) {
            Image(systemName: "video.badge.plus")
                .font(.system(size: 64))
                .foregroundStyle(.white)
            Text("60-second Live Stream")
                .font(.title2.bold())
                .foregroundStyle(.white)
            Text("Stream goes live instantly. Your video is\nstored on 0G Network after it ends.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.gray)
        }
    }

    private func readyView(streamKey: String, playbackID: String) -> some View {
        VStack(spacing: 12) {
            Text("Ready")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
            Text("Tap Go Live when you're ready.")
                .foregroundStyle(.secondary)
            if let url = viewModel.shareURL {
                ShareLink(item: url) {
                    Label("Copy share link", systemImage: "link")
                        .font(.caption)
                }
                .foregroundStyle(.blue)
            }
        }
    }

    private func liveView(seconds: Int, playbackID: String) -> some View {
        VStack(spacing: 16) {
            HStack(spacing: 6) {
                Circle()
                    .fill(.red)
                    .frame(width: 10, height: 10)
                Text("LIVE")
                    .font(.headline)
                    .foregroundStyle(.white)
            }
            Text("\(seconds)")
                .font(.system(size: 72, weight: .bold, design: .rounded))
                .foregroundStyle(seconds <= 10 ? .red : .white)
                .contentTransition(.numericText(countsDown: true))
                .animation(.default, value: seconds)
            Text("seconds remaining")
                .foregroundStyle(.secondary)

            if let url = viewModel.shareURL {
                Button {
                    showPlayer = true
                } label: {
                    Label("Watch in app", systemImage: "play.circle")
                }
                .foregroundStyle(.white)

                ShareLink("Share stream link", item: url)
                    .font(.caption)
                    .foregroundStyle(.blue)

                // Show playbackID for in-app player navigation
                Text(url.absoluteString)
                    .font(.caption2)
                    .foregroundStyle(.gray)
                    .lineLimit(1)
            }
        }
    }

    private func completeView(cid: String, playbackID: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundStyle(.green)
            Text("Stream Complete")
                .font(.title2.bold())
                .foregroundStyle(.white)

            VStack(spacing: 4) {
                Text("Stored on 0G Network")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(cid)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.gray)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .padding()
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))

            Button {
                showPlayer = true
            } label: {
                Label("Watch replay", systemImage: "play.circle.fill")
            }
            .buttonStyle(.bordered)
        }
    }

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
            ProgressView()
                .tint(.white)
                .scaleEffect(1.5)
            Image(systemName: icon)
                .font(.system(size: 36))
                .foregroundStyle(.white)
            Text(text)
                .font(.headline)
                .foregroundStyle(.white)
        }
    }

    // MARK: - Player navigation

    @ViewBuilder
    private var playerDestination: some View {
        switch viewModel.phase {
        case .live(_, let id), .complete(_, let id):
            StreamPlayerView(playbackID: id)
        default:
            Text("Stream not available")
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    CreateStreamView()
}
