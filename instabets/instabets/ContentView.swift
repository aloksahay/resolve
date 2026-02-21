
//
//  ContentView.swift
//  instabets
//

import SwiftUI

struct ContentView: View {
    @State private var selectedTab: Int = 0
    @State private var createViewID = UUID()

    var body: some View {
        TabView(selection: $selectedTab) {
            CreateStreamView()
                .id(createViewID)
                .tabItem {
                    Label("Create Bet", systemImage: "plus.circle.fill")
                }
                .tag(0)
            NowView(onNewBet: {
                createViewID = UUID()
                selectedTab = 0
            })
                .tabItem {
                    Label("Instabet Now", systemImage: "house.fill")
                }
                .tag(1)
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
        .preferredColorScheme(.dark)
}
