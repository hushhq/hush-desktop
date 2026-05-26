cask "hush" do
  # HUSHHQ-35. Homebrew Cask manifest template.
  # Update `version`, both `sha256` values, and verify the artifact
  # URL before submitting to a Homebrew tap.
  version "0.1.38-mvp"

  on_arm do
    sha256 "fb7b437dc2a2ed3bcdec51927d805e9f9ae9b6ade0cc5c2b5ce8bfd70e2f45e9"
    url "https://github.com/hushhq/hush-desktop/releases/download/v#{version}/Hush-#{version}-arm64.dmg"
  end
  on_intel do
    sha256 "fe92e911e9b3944efdb75fefc68f2b38364e893804e3ccaa7d304b39d044986a"
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
