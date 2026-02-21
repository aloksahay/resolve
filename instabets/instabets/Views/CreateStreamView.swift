
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
    let attach: (MTHKView) async -> Void

    func makeUIView(context: Context) -> MTHKView {
        let view = MTHKView(frame: .zero)
        view.videoGravity = .resizeAspectFill
        Task { await attach(view) }
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
                VStack {
                    Spacer()
                    phaseContent
                    Spacer()
                    actionBar
                }
                .padding()
                .onTapGesture {
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                }

                // Countdown timer — top-right corner during live
                if case .live(let seconds, _) = viewModel.phase {
                    VStack {
                        HStack {
                            Spacer()
                            Text(timeString(seconds))
                                .font(.system(size: 22, weight: .bold, design: .monospaced))
                                .foregroundStyle(.white)
                                .shadow(color: .black.opacity(0.6), radius: 4, x: 0, y: 2)
                                .padding(.trailing, 16)
                                .padding(.top, 8)
                        }
                        Spacer()
                    }
                }
            }
            .background { cameraBackground }
            .task { await viewModel.prepareCamera() }
            .navigationTitle("InstaBet Now!")
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
        case .idle, .readyToGo, .live:
            CameraPreview(attach: { view in await viewModel.attachPreview(view) })
                .ignoresSafeArea()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        default:
            Color.black.ignoresSafeArea()
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
            Button("Create InstaBet") {
                Task { await viewModel.prepareStream() }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(viewModel.condition.trimmingCharacters(in: .whitespaces).count < 5)

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
        TextField("What's your prediction? (e.g. I will do 10 pushups)", text: $viewModel.condition, axis: .vertical)
            .lineLimit(2...4)
            .padding(12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            .foregroundStyle(.white)
    }

    private func readyView(streamKey: String, playbackID: String) -> some View {
        VStack(spacing: 12) {
            Text("Ready")
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
            Text("Tap Go Live when you're ready.")
                .foregroundStyle(.secondary)
        }
    }

    private func liveView(seconds: Int, playbackID: String) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(.red)
                .frame(width: 10, height: 10)
            Text("LIVE")
                .font(.headline)
                .foregroundStyle(.white)
        }
    }

    private func completeView(cid: String, playbackID: String) -> some View {
        VStack(spacing: 16) {
            outcomeBadge(outcome: viewModel.marketOutcome)

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

    @ViewBuilder
    private func outcomeBadge(outcome: String) -> some View {
        switch outcome {
        case "Yes":
            Label("YES — Condition met!", systemImage: "checkmark.seal.fill")
                .font(.title3.bold())
                .foregroundStyle(.green)
        case "No":
            Label("NO — Condition not met", systemImage: "xmark.seal.fill")
                .font(.title3.bold())
                .foregroundStyle(.red)
        default:
            Label("Awaiting resolution…", systemImage: "clock")
                .font(.title3)
                .foregroundStyle(.secondary)
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

    private func timeString(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
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
        .preferredColorScheme(.dark)
}
