
//
//  HomeView.swift
//  instabets
//
//  Home tab — placeholder for the prediction market feed.
//

import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "chart.bar.xaxis.ascending.badge.clock")
                    .font(.system(size: 64))
                    .foregroundStyle(.secondary)

                VStack(spacing: 8) {
                    Text("instabets")
                        .font(.largeTitle.bold())
                    Text("Prediction markets for live moments")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Text("Your active bets and live streams\nwill appear here.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Home")
        }
    }
}

#Preview {
    HomeView()
}
