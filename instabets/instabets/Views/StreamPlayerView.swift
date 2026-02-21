
//
//  StreamPlayerView.swift
//  instabets
//
//  In-app HLS player for watching the live stream.
//  Note: HLS has ~20 s of latency vs. the camera — this is normal.
//

import AVKit
import SwiftUI

struct StreamPlayerView: View {
    let playbackID: String

    @State private var player: AVPlayer?

    private var hlsURL: URL? {
        URL(string: "\(Config.muxPlaybackBase)/\(playbackID).m3u8")
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
            } else {
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(.white)
                    Text("Loading stream…")
                        .foregroundStyle(.white)
                        .font(.caption)
                    Text("HLS has ~20 s latency — hang tight")
                        .foregroundStyle(.gray)
                        .font(.caption2)
                }
            }
        }
        .navigationTitle("Watch Live")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard let url = hlsURL else { return }
            let p = AVPlayer(url: url)
            p.play()
            self.player = p
        }
        .onDisappear {
            player?.pause()
            player = nil
        }
    }
}

#Preview {
    StreamPlayerView(playbackID: "demo")
}
