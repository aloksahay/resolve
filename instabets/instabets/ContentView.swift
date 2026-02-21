
//
//  ContentView.swift
//  instabets
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            CreateStreamView()
                .tabItem {
                    Label("Go Live", systemImage: "video.circle.fill")
                }
            HomeView()
                .tabItem {
                    Label("Instabet Now", systemImage: "house.fill")
                }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView()
        .preferredColorScheme(.dark)
}
