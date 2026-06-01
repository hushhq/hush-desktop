cask "hush" do
  # HUSHHQ-35. Homebrew Cask manifest template.
  # Update `version`, both `sha256` values, and verify the artifact
  # URL before submitting to a Homebrew tap.
  version "0.1.44-mvp"

  on_arm do
    sha256 "be0d047731e823f0fd246e4867ceadf3c672c0c49d07a82818056aa148ffcd9b"
    url "https://github.com/hushhq/hush-desktop/releases/download/v#{version}/Hush-#{version}-arm64.dmg"
  end
  on_intel do
    sha256 "fe80acbec93eda2d0ecc638519f82889daba77b5368e6fb2d6f4ac5a9e19ec0a"
    url "https://github.com/hushhq/hush-desktop/releases/download/v#{version}/Hush-#{version}.dmg"
  end

  name "Hush"
  desc "End-to-end encrypted messenger"
  homepage "https://gethush.live"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "Hush.app"

  zap trash: [
    "~/Library/Application Support/Hush",
    "~/Library/Preferences/live.gethush.desktop.plist",
    "~/Library/Logs/Hush",
    "~/Library/Saved Application State/live.gethush.desktop.savedState",
  ]
end
